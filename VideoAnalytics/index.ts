// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices,
  AudioAnalyzerPreset,
  VideoAnalyzerPreset,
} from '@azure/arm-mediaservices';
import * as factory  from "../Common/Encoding/transformFactory";
import * as jobHelper from "../Common/Encoding/encodingJobHelpers";
import { v4 as uuidv4 } from 'uuid';
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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "analyze-videoaudio";

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

  // These are the names used for creating and finding your transforms
  const audioAnalyzerTransformName = "AudioAnalyzerTransform";
  const videoAnalyzerTransformName = "VideoAnalyzerTransform";

  mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

  // Configure the jobHelper to simplify the sample code
  // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
  // This helps to keep the main sample cleaner and avoid so much redundant code in samples
  jobHelper.setMediaServicesClient(mediaServicesClient);
  jobHelper.setAccountName(accountName);
  jobHelper.setResourceGroup(resourceGroup);

  // Ensure that you have customized transforms for the AudioAnalyzer and VideoAnalyzer.  This is really a one time setup operation.
  console.log("Creating Audio and Video analyzer transforms...");

  // Create a new Basic Audio Analyzer Transform Preset using the preset configuration
  let audioAnalyzerBasicPreset: AudioAnalyzerPreset = factory.createAudioAnalyzerPreset({
    audioLanguage: "en-US", // Be sure to modify this to your desired language code in BCP-47 format
    mode: "Basic",  // Change this to Standard if you would like to use the more advanced audio analyzer
  });

  // Create a new Video Analyzer Transform Preset using the preset configuration
  let videoAnalyzerPreset: VideoAnalyzerPreset = factory.createVideoAnalyzerPreset({
    audioLanguage: "en-US",  // Be sure to modify this to your desired language code in BCP-47 format
    insightsToExtract: "AllInsights", // Video Analyzer can also run in Video only mode.
    mode: "Standard", // Video analyzer can also process audio in basic or standard mode when using All Insights
    experimentalOptions : { // Optional settings for preview or experimental features
       // "SpeechProfanityFilterMode": "None" // Disables the speech-to-text profanity filtering
    }
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


  console.log("Creating video analyzer transform...");
  let videoAnalyzerTransform = await mediaServicesClient.transforms.createOrUpdate(resourceGroup, accountName, videoAnalyzerTransformName, {
    name: videoAnalyzerTransformName,
    outputs: [
      {
        preset: videoAnalyzerPreset
      }
    ]
  })
    .then((transform) => {
      console.log(`Transform ${transform.name} created (or updated if it existed already).`);
    })
    .catch((reason) => {
      console.log(`There was an error creating the video analyzer transform. ${reason}`)
    });

  let uniqueness = uuidv4();
  let input = await jobHelper.getJobInputType(inputFile,inputUrl,namePrefix,uniqueness);
  let outputAssetName = `${namePrefix}-output-${uniqueness}`;
  let jobName = `${namePrefix}-job-${uniqueness}`;

  console.log("Creating the output Asset to analyze the content into...");

  await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

  // Choose which of the analyzer Transform names you would like to use here by changing the name of the Transform to be used
  // For the basic audio analyzer - pass in the audioAnalyzerTransformName
  // For the video Analyzer - change this code to pass in the videoAnalyzerTransformName
  let analysisTransformName = audioAnalyzerTransformName; // or change to videoAnalyzerTransformName to see those results

  console.log(`Submitting the analyzer job to the ${analysisTransformName} job queue...`);

  let job = await jobHelper.submitJob(analysisTransformName, jobName, input, outputAssetName);

  console.log(`Waiting for Job - ${job.name} - to finish analyzing`);
  job = await jobHelper.waitForJobToFinish(analysisTransformName, jobName);

  if (job.state == "Finished") {
    await jobHelper.downloadResults(outputAssetName as string, outputFolder);
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

