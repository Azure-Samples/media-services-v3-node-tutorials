// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices,
  AssetContainerPermission,
  JobOutputAsset,
  JobInputUnion,
  JobsGetResponse,
  AudioAnalyzerPreset,
  VideoAnalyzerPreset,
  KnownAudioAnalysisMode,
  JobOutputUnion,
} from '@azure/arm-mediaservices';
import * as factory  from "../Common/Encoding/transformFactory";
import { BlobServiceClient, AnonymousCredential } from "@azure/storage-blob";
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
const clientId: string = process.env.AZURE_CLIENT_ID as string;
const secret: string = process.env.AZURE_CLIENT_SECRET as string;

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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string = "Media\\ignite.mp4";
// This is a hosted sample file to use. It can be anything accessible on the series of tubes and pipes.
let inputUrl: string; //= "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "analyze-audio";
let inputExtension: string;
let blobName: string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

  // These are the names used for creating and finding your transforms
  const audioAnalyzerTransformName = "AudioAnalyzerTransformBasic";

  mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

  // Ensure that you have customized transforms for the AudioAnalyzer.  This is really a one time setup operation.
  console.log("Creating Audio analyzer transforms...");

  // Create a new Basic Audio Analyzer Transform Preset using the preset configuration
  let audioAnalyzerBasicPreset: AudioAnalyzerPreset = factory.createAudioAnalyzerPreset({
    audioLanguage: "en-GB", // Be sure to modify this to your desired language code in BCP-47 format. 
    // Set the language to British English - see https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support#speech-to-text 
    //
    // There are two modes available, Basic and Standard
    // Basic : This mode performs speech-to-text transcription and generation of a VTT subtitle/caption file. 
    //         The output of this mode includes an Insights JSON file including only the keywords, transcription,and timing information. 
    //         Automatic language detection and speaker diarization are not included in this mode.
    // Standard : Performs all operations included in the Basic mode, additionally performing language detection and speaker diarization.
    //
    mode: KnownAudioAnalysisMode.Basic,  // Change this to Standard if you would like to use the more advanced audio analyzer
  });
  console.log("Creating audio analyzer transform...");

  await mediaServicesClient.transforms.createOrUpdate(resourceGroup, accountName, audioAnalyzerTransformName, {
    name: audioAnalyzerTransformName,
    outputs: [
      {
        preset: audioAnalyzerBasicPreset
      }
    ]
  })
    .then((transform) => {
      console.log(`Transform ${transform.name} created (or updated if it existed already).`);
    })
    .catch((reason) => {
      console.log(`There was an error creating the transform. ${reason}`)
    });


  let uniqueness = uuidv4();
  let input = await getJobInputType(uniqueness);
  let outputAssetName = `${namePrefix}-output-${uniqueness}`;
  let jobName = `${namePrefix}-job-${uniqueness}`;

  console.log("Creating the output Asset to analyze the content into...");

  await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});
  let analysisTransformName = audioAnalyzerTransformName; 

  // The next section is mostly optional, but shows how you can override the default language that was set when the Transform was first created above. 
  // Use this method if you need to change the language used in the same Transform.  
  // This can help reduce the number of Transforms you have to define.  For example, you would not want to have a "Basic Audio Transform" for every language supported in AMS.  
  // That would just be silly right?

  // <PresetOverride>
  // First we re-define the preset that we want to use for this specific Job...
  // We can redefine any jobs preset
  let presetOverride = factory.createAudioAnalyzerPreset(
  {
      audioLanguage: "en-US", // swap the language from British English to US English here
      mode: KnownAudioAnalysisMode.Basic 
  });

  // Then we use the PresetOverride property of the JobOutput to pass in the override values to use on this single Job 
  // without the need to create a completely separate and new Transform with another language code or Mode setting. 
  // This can save a lot of complexity in your AMS account and reduce the number of Transforms used.
  let jobOutput = factory.createJobOutputAsset(
  {
      assetName: outputAssetName,
      presetOverride: presetOverride  // pass in the Preset override here to change the default Transform setting on this job.
  })

  // After the job completes you can inspect the downloaded insights.json file to confirm that the language was set properly.
  // by matching the "sourceLanguage" and "language" properties in that file. "language": "en-US" for example. 

  console.log(`Submitting the audio analysis job to the ${analysisTransformName} job queue...`);
  let job = await submitJob(analysisTransformName, jobName, input, jobOutput);

  // </PresetOverride>

  console.log(`Waiting for Job - ${job.name} - to finish analyzing`);
  job = await waitForJobToFinish(analysisTransformName, jobName);

  if (job.state == "Finished") {
    await downloadResults(outputAssetName as string, outputFolder);
    console.log("Downloaded results to local folder. Please review the outputs from the analysis job.")
  }
}


main().catch((err) => {
    
  console.error("Error running sample:", err.message);
  console.error (`Error code: ${err.code}`);

  if (err.name == 'RestError'){
      // REST API Error message
      console.error("Error request:\n\n", err.request);
  }

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
    // Note that you can report the progress for each Job output if you have more than one. In this case, we only have one output in the Transform
    // that we defined in this sample, so we can check that with the job.outputs[0].progress parameter.
    if (job.outputs != undefined) {
      console.log(`Job State is : ${job.state},  Progress: ${job.outputs[0].progress}%`);
    }

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
    // Otherwise, adding a name here creates a sub folder, which will break the analysis. 
    let containerClient = blobClient.getContainerClient('');
    // Next gets the blockBlobClient needed to use the uploadFile method
    let blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Parallel uploading with BlockBlobClient.uploadFile() in Node.js runtime
    // BlockBlobClient.uploadFile() is only available in Node.js and not in Browser
    await blockBlobClient.uploadFile(fileToUpload, {
      blockSize: 4 * 1024 * 1024, // 4MB Block size
      concurrency: 20, // 20 concurrent
      onProgress: (ev) => console.log(ev)
    });

  }

  return asset;
}


async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, jobOutput: JobOutputAsset) {
  if (jobOutput === undefined) {
    throw new Error("JobOutput is not defined. Check creation of the output asset");
  }

  let jobOutputs: JobOutputAsset[] = [
    jobOutput
  ];

  return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
    input: jobInput,
    outputs: jobOutputs
  });

}

