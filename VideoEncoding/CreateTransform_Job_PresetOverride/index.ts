// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// This sample demonstrates how to create an very simple Transform to use for submitting any custom Job into.
// Creating a very basic transform in this fashion allows you to treat the AMS v3 API more like the legacy v2 API where 
// transforms were not required, and you could submit any number of custom jobs to the same endpoint. 
// In the new v3 API, the default workflow is to create a transform "template" that holds a unique queue of jobs just for that
// specific "recipe" of custom or pre-defined encoding. 
//
// In this sample, we show you how to create the blank empty Transform, and then submit a couple unique custom jobs to it,
// overriding the blank empty Transform. 


import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownAacAudioProfile,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    KnownH264Complexity,
    StandardEncoderPreset
} from '@azure/arm-mediaservices';
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
import * as factory  from "../../Common/Encoding/TransformFactory";
import { v4 as uuidv4 } from 'uuid';
// Load the .env file if it exists
import * as dotenv from "dotenv";
dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "emptyTransform";

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "EmptyTransform";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Configure the jobHelper to simplify the sample code
    // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
    // This helps to keep the main sample cleaner and avoid so much redundant code in samples
    jobHelper.setMediaServicesClient(mediaServicesClient);
    jobHelper.setAccountName(accountName);
    jobHelper.setResourceGroup(resourceGroup);

    // Create a new Standard encoding Transform that is empty
    console.log(`Creating empty, blank, Standard Encoding transform named: ${transformName}`);

    // In this sample, we create the simplest of Transforms allowed by the API to later submit custom jobs against.
    // Even though we define a single layer H264 preset here, we are going to override it later with a custom job level preset.
    // This allows you to treat this single Transform queue like the legacy v2 API, which only supported a single Job queue type.
    // In v3 API, the typical workflow that you will see in other samples is to create a transform "recipe" and submit jobs to it
    // that are all of the same type of output. 
    // Some customers need the flexibility to submit custom Jobs. 

    // First we create an mostly empty TransformOutput with a very basic H264 preset that we override later.
    // If a Job were submitted to this base Transform, the output would be a single MP4 video track at 1 Mbps. 
    let transformOutput: TransformOutput[] = [{
        preset: factory.createStandardEncoderPreset({
            codecs: [
                factory.createH264Video({
                    layers:[
                        factory.createH264Layer({
                            bitrate: 1000000, // Units are in bits per second and not kbps or Mbps - 1 Mbps or 1,000 kbps
                    })]
                })
            ],
            formats: [
                factory.createMp4Format({
                    filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
                })
            ],
        }),
        // What should we do with the job if there is an error?
        onError: KnownOnErrorType.StopProcessingJob,
        // What is the relative priority of this job to others? Normal, high or low?
        relativePriority: KnownPriority.Normal
    }
    ];

    console.log("Creating empty transform...");

    let transform: Transform = {
        name: transformName,
        description: "An empty transform to be used for submitting custom jobs against",
        outputs: transformOutput
    }

    await mediaServicesClient.transforms.createOrUpdate(resourceGroup, accountName, transformName, transform)
        .then((transform) => {
            console.log(`Transform ${transform.name} created (or updated if it existed already).`);
        })
        .catch((reason) => {
            console.log(`There was an error creating the transform. ${reason}`)
        });

    let uniqueness = uuidv4();
    let input = await jobHelper.getJobInputType(inputFile, inputUrl,namePrefix,uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Creating a new custom preset override and submitting the job to the empty transform ${transformName} job queue...`);

    // Create a new Preset Override to define a custom standard encoding preset
    let standardPreset_H264: StandardEncoderPreset = factory.createStandardEncoderPreset({
        codecs: [
            factory.createH264Video({
                // Next, add a H264Video for the video encoding
                keyFrameInterval: "PT2S", //ISO 8601 format supported
                complexity: KnownH264Complexity.Speed,
                layers: [
                    factory.createH264Layer({
                        bitrate: 3600000, // Units are in bits per second and not kbps or Mbps - 3.6 Mbps or 3,600 kbps
                        width: "1280",
                        height: "720",
                        label: "HD-3600kbps" // This label is used to modify the file name in the output formats
                    })
                ]
            }),
           factory.createAACaudio({
                // Add an AAC Audio layer for the audio encoding
                channels: 2,
                samplingRate: 48000,
                bitrate: 128000,
                profile: KnownAacAudioProfile.AacLc
            })
        ],
        formats: [
            factory.createMp4Format({
                filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
            })
        ]

    });

    // Submit the H264 encoding custom job, passing in the preset override defined above.
    let job = await jobHelper.submitJob(transformName, jobName, input, outputAssetName, undefined, standardPreset_H264);

    // Next, we will create another preset override that uses HEVC instead and submit it against the same simple transform
     // Create a new Preset Override to define a custom standard encoding preset
     let standardPreset_HEVC: StandardEncoderPreset = factory.createStandardEncoderPreset({
        codecs: [
            factory.createH265Video({
                // Next, add a H264Video for the video encoding
                keyFrameInterval: "PT2S", //ISO 8601 format supported
                complexity: KnownH264Complexity.Speed,
                layers: [
                    factory.createH265Layer({
                        bitrate: 1800000, // Units are in bits per second and not kbps or Mbps - 3.6 Mbps or 3,600 kbps
                        maxBitrate: 1800000,
                        width: "1280",
                        height: "720",
                        bFrames: 4,
                        label: "HD-1800kbps" // This label is used to modify the file name in the output formats
                    }),
                ]
            }),
            factory.createAACaudio({
                // Add an AAC Audio layer for the audio encoding
                channels: 2,
                samplingRate: 48000,
                bitrate: 128000,
                profile: KnownAacAudioProfile.AacLc
            })
        ],
        formats: [
            factory.createMp4Format({
                filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
            })
        ]
    });

    // Lets update some names to re-use for the HEVC job we want to submit
    let jobNameHEVC = jobName + "_HEVC";
    let outputAssetNameHEVC = outputAssetName + "_HEVC";

    // Lets create a new output asset
    console.log("Creating a new output Asset (container) to encode the content into...");
    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetNameHEVC, {});

     // Submit the next HEVC custom job, passing in the preset override defined above.
    let job2 = await jobHelper.submitJob(transformName, jobNameHEVC, input, outputAssetNameHEVC, undefined, standardPreset_HEVC);


    console.log(`Waiting for encoding Jobs to finish...`);
    job = await jobHelper.waitForJobToFinish(transformName, jobName);
    job2 =await jobHelper.waitForJobToFinish(transformName, jobNameHEVC);

    // Wait for the first H264 job to finish and then download the output
    if (job.state == "Finished") {
        await jobHelper.downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded H264 custom job to local folder. Please review the outputs from the encoding job.")
    }

    // check on the status of the second HEVC encoding job and then download the output
    if (job2.state == "Finished") {
        await jobHelper.downloadResults(outputAssetNameHEVC as string, outputFolder);
        console.log("Downloaded HEVC custom job to local folder.")
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