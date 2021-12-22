// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {AzureLogLevel,setLogLevel} from "@azure/logger";
import {
    AzureMediaServices,
    TransformOutput,
    KnownAacAudioProfile,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    KnownH264Complexity,
    Asset
} from '@azure/arm-mediaservices';
import * as factory from "../../Common/Encoding/TransformFactory";
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
import { v4 as uuidv4 } from 'uuid';
// Load the .env file if it exists
import * as dotenv from "dotenv";
dotenv.config();

// You can view the raw REST API calls by setting the logging level to verbose
// For details see - https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/core/logger/README.md 
setLogLevel("error");

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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string = "Media\\ignite.mp4";
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Add a bumper to the front of the video
let bumperFile: string = "Media\\Azure_Bumper.mp4";

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "stitchTwoAssets";

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "StitchTwoAssets";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Configure the jobHelper to simplify the sample code
    // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
    // This helps to keep the main sample cleaner and avoid so much redundant code in samples
    jobHelper.setMediaServicesClient(mediaServicesClient);
    jobHelper.setAccountName(accountName);
    jobHelper.setResourceGroup(resourceGroup);

    // Create a new Standard encoding Transform for H264
    console.log(`Creating Standard Encoding transform named: ${transformName}`);

    // First we create a TransformOutput
    let transformOutput: TransformOutput[] = [{
        preset: factory.createStandardEncoderPreset({
            codecs: [
                factory.createAACaudio({
                    channels: 2,
                    samplingRate: 48000,
                    bitrate: 128000,
                    profile: KnownAacAudioProfile.AacLc
                }),
                factory.createH264Video({
                    keyFrameInterval: "PT2S", //ISO 8601 format supported
                    complexity: KnownH264Complexity.Balanced,
                    layers: [
                        factory.createH264Layer({
                            bitrate: 3600000, // Units are in bits per second and not kbps or Mbps - 3.6 Mbps or 3,600 kbps
                            width: "1280",
                            height: "720",
                            label: "HD-3600kbps" // This label is used to modify the file name in the output formats
                        })
                    ]
                })
            ],
            // Specify the format for the output files - one for video+audio, and another for the thumbnails
            formats: [
                // Mux the H.264 video and AAC audio into MP4 files, using basename, label, bitrate and extension macros
                // Note that since you have multiple H264Layers defined above, you have to use a macro that produces unique names per H264Layer
                // Either {Label} or {Bitrate} should suffice
                factory.createMp4Format({
                    filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
                })
            ]
        }),
        // What should we do with the job if there is an error?
        onError: KnownOnErrorType.StopProcessingJob,
        // What is the relative priority of this job to others? Normal, high or low?
        relativePriority: KnownPriority.Normal
    }
    ];

    console.log("Creating encoding transform...");

    let transform: Transform = {
        name: transformName,
        description: "Stitches together two assets",
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
    // Create a new  Asset and upload the 1st specified local video file into it. This is our video "bumper" to stitch to the front.
    let input: Asset = await jobHelper.createInputAsset("main" + uniqueness, inputFile) // This creates and uploads the main video file
    // Create a second  Asset and upload the 2nd specified local video file into it.
    let input2: Asset = await jobHelper.createInputAsset("bumper" + uniqueness, bumperFile); // This creates and uploads the second video file.

    // Create a Job Input Sequence with the two assets to stitch together
    // In this sample we will stitch a bumper into the main video asset at the head, 6 seconds, and at the tail. We end the main video at 12s total. 
    // TIMELINE :   | Bumper | Main video -----> 6 s | Bumper | Main Video 6s -----------> 12s | Bumper |s
    // You can extend this sample to stitch any number of assets together and adjust the time offsets to create custom edits

    if (input.name === undefined || input2.name === undefined) {
        throw new Error("Error: Input assets were not created properly");
    }

    let bumperJobInputAsset = factory.createJobInputAsset(
        {
            assetName: input2.name,
            start: {
                odataType: "#Microsoft.Media.AbsoluteClipTime",
                time: "PT0S"
            },
            label: "bumper"
        }
    );

    let mainJobInputAsset = factory.createJobInputAsset(
        {
            assetName: input.name,
            start: {
                odataType: "#Microsoft.Media.AbsoluteClipTime",
                time: "PT0S"
            },
            label: "main"
        }
    );


    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;
        
    // Create the Output Asset for the Job to write final results to. 
    console.log("Creating the output Asset (container) to encode the content into...");
    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    // This submit Job method was modified to take the inputSequence instead of a single input
    let job = await jobHelper.submitJobWithInputSequence(transformName, jobName, [bumperJobInputAsset, mainJobInputAsset], outputAssetName);

    console.log(`Waiting for encoding Job - ${job.name} - to finish...`);
    job = await jobHelper.waitForJobToFinish(transformName, jobName);

    if (job.state == "Finished") {
        await jobHelper.downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded results to local folder. Please review the outputs from the encoding job.")
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