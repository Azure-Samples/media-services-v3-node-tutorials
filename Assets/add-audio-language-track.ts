// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices,
  BuiltInStandardEncoderPreset,
  AssetContainerPermission,
  JobOutputAsset,
  JobInputUnion,
  JobsGetResponse,
  KnownTrackPropertyType
} from '@azure/arm-mediaservices';

import {
  BlobServiceClient,
  AnonymousCredential
} from "@azure/storage-blob";
import * as factory from "../Common/Encoding/transformFactory";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';

// Load the .env file if it exists
import * as dotenv from "dotenv";
dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const subscriptionId: string = process.env.AZURE_SUBSCRIPTION_ID as string;
const resourceGroup: string = process.env.AZURE_RESOURCE_GROUP as string;
const accountName: string = process.env.AZURE_MEDIA_SERVICES_ACCOUNT_NAME as string;


// This sample uses the default Azure Credential object, which relies on the environment variable settings.
// If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
// Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
// https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
// See the following examples for how to authenticate in Azure with managed identity
// https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

// const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
const credential = new DefaultAzureCredential();

// You can either specify a local input file with the inputFile or an input Url with inputUrl. 
// Just set the other one to null to have it select the right JobInput class type
let inputFile: string = "Media\\elephants_dream\\ElephantsDream_H264_1000kbps_AAC_und_ch2_128kbps.mp4"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
// This is a hosted sample file to use
//let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Temp";
const namePrefix: string = "stream";
let inputExtension: string;
let blobName: string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {
  // Define the name to use for the encoding Transform that will be created
  const encodingTransformName = "ContentAwareEncoding";

  mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

  try {
    // Ensure that you have the desired encoding Transform. This is really a one time setup operation.
    console.log("Creating encoding transform...");

    // Create a new Transform using a preset name from the list of built in encoding presets. 
    // To use a custom encoding preset, you can change this to be a StandardEncoderPreset, which has support for codecs, formats, and filter definitions.
    // This sample uses the 'ContentAwareEncoding' preset which chooses the best output based on an analysis of the input video.
    // NOTE that live archives do not currently support late binding audio tracks, so you have to first re-encode those into a new asset to allow you to late bind stuff to them. 
    let adaptiveStreamingTransform: BuiltInStandardEncoderPreset = factory.createBuiltInStandardEncoderPreset({
      presetName: "ContentAwareEncoding"
    });

    let encodingTransform = await mediaServicesClient.transforms.createOrUpdate(resourceGroup, accountName, encodingTransformName, {
      name: encodingTransformName,
      outputs: [
        {
          preset: adaptiveStreamingTransform
        }
      ]
    });
    console.log("Transform Created (or updated if it existed already).");


    let uniqueness = uuidv4();
    let input = await getJobInputType(uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;
    let locatorName = `locator${uniqueness}`;

    console.log("Creating the output Asset to encode content into...");
    let outputAsset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    if (outputAsset.name !== undefined) {
      console.log("Submitting the encoding job to the Transform's job queue...");
      let job = await submitJob(encodingTransformName, jobName, input, outputAsset.name);

      console.log(`Waiting for Job - ${job.name} - to finish encoding`);
      job = await waitForJobToFinish(encodingTransformName, jobName);


      // Now we are going to "late bind" an additional audio track file to the asset. 

      // First we set the upload expiration date and add an hour to it to give us some upload time. 
      let uploadExpireDate = new Date();
      uploadExpireDate.setHours(uploadExpireDate.getHours() + 1);

      // Next we create a ReadWrite permission on the asset's container. 
      let readWritePermission: AssetContainerPermission = "ReadWrite";

      // Next we list the container SAS URLs on the asset with the permissions that we desire. 
      // This is easier than using the Storage blob SDK and credentials for our specific account to get this information.
      // By using SAS URLs we don't need the account keys in this code. 
      let outputAssetContainerSas = await mediaServicesClient.assets.listContainerSas(
        resourceGroup,
        accountName,
        outputAsset.name,
        {
          permissions: readWritePermission,
          expiryTime: uploadExpireDate
        });

      // This is the late bound audio track file we will upload to the asset container
      // NOTE that live archives do not currently support late binding tracks, so you have to first re-encode those into a new asset to allow you to late bind stuff to them. 
      let filename= "ElephantsDream_audio_spa.mp4";
      let audioLanguageFile = `Media\\elephants_dream\\${filename}`;

      console.log("Uploading the Audio language file to the output asset.")
      // Now we have a SAS URL to write back into the output asset. This is where we are going to upload our audio file to add to the output asset
      if (outputAssetContainerSas.assetContainerSasUrls) {
        let uploadSasUrl = outputAssetContainerSas.assetContainerSasUrls[0];
        uploadFileToSas(uploadSasUrl,audioLanguageFile);
      }

      //Now that we have a file uploaded, we need to create a new audio track for the file
      console.log("Using the tracks api to add the new late bound audio file to the asset")
      await mediaServicesClient.tracks.beginCreateOrUpdateAndWait(
        resourceGroup,
        accountName,
        outputAsset.name,
        "Spanish", 
        {
            name: "Spanish",
            track: {
              odataType: "#Microsoft.Media.AudioTrack",
              displayName:"Spanish",
              languageCode:"es-ES",
              fileName: filename,
              hlsSettings:{
                default:false, 
                forced:false,
                //Allowed values for HLS characteristics, as per HLS rfc(https://www.rfc-editor.org/rfc/rfc8216.html)
                // An AUDIO Rendition MAY include the following characteristic for descriptive audio.
                // characteristics:"public.accessibility.describes-video"
              },
              playerVisibility:"Visible" 
            }
        },
        {
          updateIntervalInMs: 1000,
        } 
      )



      // List all of the tracks available on this asset
      for await (const tracks of mediaServicesClient.tracks.list(resourceGroup, accountName, outputAssetName, {})) {
        console.log(`Track Name: ${tracks.name} \t Track: ${JSON.stringify(tracks.track)}`);
      }

      let locator = await createStreamingLocator(outputAsset.name, locatorName);
      if (locator.name !== undefined) {
        let urls = await getStreamingUrls(locator.name);
      } else throw new Error("Locator was not created or Locator.name is undefined");
    }

  } catch (err) {
    console.log(err);
  }

}

main().catch((err) => {

  console.error("Error running sample:", err.message);
  console.error(`Error code: ${err.code}`);

  if (err.name == 'RestError') {
    // REST API Error message
    console.error("Error request:\n\n", err.request);
  }

});

async function waitForJobToFinish(transformName: string, jobName: string) {
  let timeout = new Date();
  timeout.setSeconds(timeout.getSeconds() + timeoutSeconds);

  async function pollForJobStatus(): Promise<JobsGetResponse> {
    let job = await mediaServicesClient.jobs.get(resourceGroup, accountName, transformName, jobName);
    console.log(job.state);
    if (job.state == 'Finished' || job.state == 'Error' || job.state == 'Canceled') {

      return job;
    } else if (new Date() > timeout) {
      console.log(`Job ${job.name} timed out. Please retry or check the source file.`);
      return job;
    } else {
      await setTimeoutPromise(sleepInterval, null);
      return pollForJobStatus();
    }
  }

  return await pollForJobStatus();
}


// Selects the JobInput type to use based on the value of inputFile or inputUrl. 
// Set inputFile to null to create a Job input that sources from an HTTP URL path
// Creates a new input Asset and uploads the local file to it before returning a JobInputAsset object
// Returns a JobInputHttp object if inputFile is set to null, and the inputUrl is set to a valid URL
async function getJobInputType(uniqueness: string): Promise<JobInputUnion> {
  if (inputFile !== undefined) {
    let assetName: string = namePrefix + "-input-" + uniqueness;
    await createInputAsset(assetName, inputFile);
    return factory.createJobInputAsset({
      assetName: assetName
    })
  } else {
    return factory.createJobInputHttp({
      files: [inputFile]
    })
  }
}

// Creates a new Media Services Asset, which is a pointer to a storage container
// Uses the Storage Blob npm package to upload a local file into the container through the use 
// of the SAS URL obtained from the new Asset object.  
// This demonstrates how to upload local files up to the container without require additional storage credential.
async function createInputAsset(assetName: string, fileToUpload: string) {
  let uploadSasUrl: string;
  let fileName: string;
  let sasUri: url.URLRecord | null;

  let asset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, assetName, {});
  let date = new Date();
  let readWritePermission: AssetContainerPermission = "ReadWrite";

  date.setHours(date.getHours() + 1);
  let input = {
    permissions: readWritePermission,
    expiryTime: date
  }

  let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);
  if (listContainerSas.assetContainerSasUrls) {
    uploadSasUrl = listContainerSas.assetContainerSasUrls[0];
    uploadFileToSas(uploadSasUrl,fileToUpload);
  }

  return asset;
}

async function uploadFileToSas(uploadToSasUrl: string, fileToUpload:string) {

    let fileName = path.basename(fileToUpload);
    let sasUri = url.parseURL(uploadToSasUrl);

    // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
    const anonymousCredential = new AnonymousCredential();
    let blobClient = new BlobServiceClient(uploadToSasUrl, anonymousCredential)
    // We need to get the containerName here from the SAS URL path to use later when creating the container client
    let containerName = sasUri?.path[0];
    console.log(`Uploading file named ${fileName} to blob in the Asset's container...`);

    // Get the blob container client using the empty string to use the same container as the SAS URL points to.
    // Otherwise, adding a name here creates a sub folder, which will break the encoder. 
    let containerClient = blobClient.getContainerClient('');
    // Next gets the blockBlobClient needed to use the uploadFile method
    let blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Parallel uploading with BlockBlobClient.uploadFile() in Node.js runtime
    // BlockBlobClient.uploadFile() is only available in Node.js and not in Browser
    await blockBlobClient.uploadFile(fileToUpload, {
      blockSize: 4 * 1024 * 1024, // 4MB Block size
      concurrency: 20, // 20 concurrent
      onProgress: (ev) => console.log(ev)
    })

  }

  async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string) {
    if (outputAssetName == undefined) {
      throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }
    let jobOutputs: JobOutputAsset[] = [
      factory.createJobOutputAsset({
        assetName: outputAssetName
      })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
      input: jobInput,
      outputs: jobOutputs
    });

  }

  async function createStreamingLocator(assetName: string, locatorName: string) {
    let streamingLocator = {
      assetName: assetName,
      streamingPolicyName: "Predefined_ClearStreamingOnly"  // no DRM or AES128 encryption protection on this asset. Clear means unencrypted.
    };

    let locator = await mediaServicesClient.streamingLocators.create(
      resourceGroup,
      accountName,
      locatorName,
      streamingLocator);

    return locator;
  }

  async function getStreamingUrls(locatorName: string) {
    // Make sure the streaming endpoint is in the "Running" state on your account
    let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, "default");

    let paths = await mediaServicesClient.streamingLocators.listPaths(resourceGroup, accountName, locatorName);
    if (paths.streamingPaths) {
      paths.streamingPaths.forEach(path => {
        path.paths?.forEach(formatPath => {
          let manifestPath = "https://" + streamingEndpoint.hostName + formatPath
          console.log(manifestPath);
          console.log(`Click to playback in AMP player: http://ampdemo.azureedge.net/?url=${manifestPath}`)
        });
      });
    }
  }