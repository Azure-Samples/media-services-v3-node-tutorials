// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownAacAudioProfile,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    KnownH264Complexity
} from '@azure/arm-mediaservices';
import * as factory from "../../Common/Encoding/transformFactory";
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
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

// ----------- BEGIN SAMPLE SETTINGS -------------------------------

// You can either specify a local input file with the inputFile or an input Url with inputUrl. 
// Just set the other one to null to have it select the right JobInput class type

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string = "Media\\ignite.mp4";

// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Use the following PNG image to overlay on top of the video.
let overlayFile = "Media\\AzureMediaService.png";
let overlayLabel = "overlayCloud"

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encodeOverlayPng";
const transformName = "H264EncodingOverlayImagePng";

// ----------- END SAMPLE SETTINGS -------------------------------


///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {


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
                        }),
                        factory.createH264Layer(
                            {
                                bitrate: 1600000, // Units are in bits per second and not kbps or Mbps - 1.6 Mbps or 1600 kbps
                                width: "960",
                                height: "540",
                                label: "SD-1600kbps" // This label is used to modify the file name in the output formats
                            }),
                    ]
                }),
            ],
            // Specify the format for the output files - one for video+audio, and another for the thumbnails
            formats: [
                // Mux the H.264 video and AAC audio into MP4 files, using basename, label, bitrate and extension macros
                // Note that since you have multiple H264Layers defined above, you have to use a macro that produces unique names per H264Layer
                // Either {Label} or {Bitrate} should suffice
                factory.createMp4Format({
                    filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
                })
            ],
            filters: {
                overlays: [
                    factory.createVideoOverlay({
                        inputLabel: overlayLabel, // same label that is used in the JobInput to identify which file in the asset is the actual overlay image .png file. 
                        position: {
                            left: "10%",  // left and top position of the overlay in absolute pixel or percentage relative to the source videos resolution. 
                            top: "10%",
                            // You can also set the height and width of the rectangle to draw into, but there is known problem here. 
                            // If you use % for the top and left (or any of these) you have to stick with % for all or you will get a job configuration Error 
                            // Also, it can alter your aspect ratio when using percentages, so you have to know the source video size in relation to the source image to 
                            // provide the proper image size.  Recommendation is to just use the right size image for the source video here and avoid passing in height and width for now. 
                            // height: (if above is percentage based, this has to be also! Otherwise pixels are allowed. No mixing. )
                            // width: (if above is percentage based, this has to be also! Otherwise pixels are allowed No mixing. )

                        },
                        opacity: 0.75, // Sets the blending opacity value to make the image slightly transparent over the video. 
                        start: "PT0S", // Start at beginning of video. 
                        fadeInDuration: "PT2S", // 2 second fade in. 
                        fadeOutDuration: "PT2S", // 2 second fade out. 
                        end: "PT5S", // end the fade out at 5 seconds on the timeline... fade will begin 2 seconds before this end time. 
                    })
                ]
            }
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
        description: "A simple custom H264 encoding transform that overlays a PNG image on the video source",
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
    let jobVideoInputAsset = await jobHelper.getJobInputType(inputFile, inputUrl, namePrefix, uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    // Create the JobInput for the PNG Image overlay
    let overlayAssetName: string = namePrefix + "-overlay-" + uniqueness;
    await jobHelper.createInputAsset(overlayAssetName, overlayFile);
    let jobInputOverlay = await factory.createJobInputAsset({
        assetName: overlayAssetName,
        label: overlayLabel // This is the same value as the label we set in the Filters of the Transform above. It tells the job that this is the asset that has the PNG image in it to use as the overlay image. 
    })

    console.log("Creating the output Asset (container) to encode the content into...");
    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    let jobInputs = [   // Create a list of JobInputs - we will add both the video and ovelay image assets here as the inputs to the job. 
        jobVideoInputAsset,
        jobInputOverlay  // Order does not matter here, it is the "label" used on the Filter and the jobInputOverlay that is important!
    ]

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    let job = await jobHelper.submitJobMultiInputs(transformName, jobName, jobInputs, outputAssetName);

    console.log(`Waiting for encoding Job - ${job.name} - to finish...`);
    job = await jobHelper.waitForJobToFinish(transformName, jobName);

    if (job.state == "Finished") {
        await jobHelper.downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded results to local folder. Please review the outputs from the encoding job.")
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