// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices,
  BuiltInStandardEncoderPreset,
  AssetContainerPermission,
  JobOutputAsset,
  JobInputUnion,
  JobsGetResponse
} from '@azure/arm-mediaservices';
import { 
  BlobServiceClient, 
  AnonymousCredential
} from "@azure/storage-blob";
import * as factory  from "../Common/Encoding/TransformFactory";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';
// Load the .env file if it exists
import * as dotenv from "dotenv";
dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const clientId: string = process.env.AADCLIENTID as string;
const secret: string = process.env.AADSECRET as string;
const tenantDomain: string = process.env.AADTENANTDOMAIN as string;
const subscriptionId: string = process.env.SUBSCRIPTIONID as string;
const resourceGroup: string = process.env.RESOURCEGROUP as string;
const accountName: string = process.env.ACCOUNTNAME as string;


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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

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

      if (job.state == "Finished") {
        await downloadResults(outputAsset.name as string, outputFolder);
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
});

async function downloadResults(assetName: string, resultsFolder: string) {
  let date = new Date();
  let readPermission: AssetContainerPermission = "Read";

  date.setHours(date.getHours() + 1);
  let input = {
    permissions: readPermission,
    expiryTime: date
  }
  let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);

  if (listContainerSas.assetContainerSasUrls) {
    let containerSasUrl = listContainerSas.assetContainerSasUrls[0];
    let sasUri = url.parseURL(containerSasUrl);
    
    // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
    const anonymousCredential = new AnonymousCredential();
    let blobClient = new BlobServiceClient(containerSasUrl, anonymousCredential)
    // We need to get the containerName here from the SAS URL path to use later when creating the container client
    let containerName = sasUri?.path[0];
    let directory = path.join(resultsFolder, assetName);
    console.log(`Downloading output into ${directory}`);

    // Get the blob container client using the container name on the SAS URL path
    // to access the blockBlobClient needed to use the uploadFile method
    let containerClient = blobClient.getContainerClient('');

    try {
      fs.mkdirSync(directory, { recursive: true });
    } catch (err) {
      // directory exists
      console.log(err);
    }
    console.log(`Listing blobs in container ${containerName}...`);
    console.log("Downloading blobs to local directory in background...");
    let i = 1;
    for await (const blob of containerClient.listBlobsFlat()) {
      console.log(`Blob ${i++}: ${blob.name}`);
     
      let blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      await blockBlobClient.downloadToFile(path.join(directory, blob.name), 0, undefined,
        {
          abortSignal: AbortController.timeout(30 * 60 * 1000),
          maxRetryRequests: 2,
          onProgress: (ev) => console.log(ev)
        }).then(() => {
          console.log(`Download file complete`);
        });
    }
  }
  
}

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
      files: [inputUrl]
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
    fileName = path.basename(fileToUpload);
    sasUri = url.parseURL(uploadSasUrl);

    // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
    const anonymousCredential = new AnonymousCredential();
    let blobClient = new BlobServiceClient(uploadSasUrl, anonymousCredential)
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

  return asset;
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