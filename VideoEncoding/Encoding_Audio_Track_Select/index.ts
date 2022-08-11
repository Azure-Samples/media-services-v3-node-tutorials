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
    TrackDescriptorUnion,
    KnownChannelMapping,
    InputDefinitionUnion,
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
let inputFile: string = "Media\\surround-audio.mp4"; // provide a sample file with 8 discrete audio tracks as layout is defined above. Path is relative to the working directory for Node.js
let inputFileName: string = "surround-audio.mp4"
// This is a hosted sample file to use
let inputUrl: string;

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encodeH264_audio_track_selection";
const transformName = "Custom_Audio_Track_Selection";

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

    // The Transform we created outputs track 0 and track 1 of the source as stereo left and right. 
    // You can adjust the track ID as needed. 
    let trackList: TrackDescriptorUnion[] = [
        factory.createSelectAudioTrackById({
            trackId: 0,
            channelMapping: KnownChannelMapping.StereoLeft
        }),
        factory.createSelectAudioTrackById(
        {
            trackId: 0,
            channelMapping: KnownChannelMapping.StereoRight
        }),
       

    ];

    // Create an input definition passing in the source file name and the list of included track mappings from that source file we made above. 
    let inputDefinitions: InputDefinitionUnion[] = [
        factory.createInputFile({
            filename: inputFileName,
            includedTracks: trackList
        })
    ];

    // Next we create a TransformOutput
    let transformOutput: TransformOutput[] = [{
        preset: factory.createStandardEncoderPreset({
            codecs: [
                factory.createAACaudio({
                    channels: 2, // The stereo mapped output track
                    samplingRate: 48000,
                    bitrate: 128000,
                    profile: KnownAacAudioProfile.AacLc,
                    label: "stereo"
                })
            ],
            // Specify the format for the output files - one for AAC audio outputs to MP4
            formats: [
                // Mux the AAC audio into MP4 file, using basename, label, bitrate and extension macros
                    factory.createMp4Format({
                    filenamePattern: "{Basename}-{Label}-{Bitrate}{Extension}",
                    outputFiles: [
                        { labels: ["stereo"] },  // Output one MP4 file with the stereo track in it.
                    ]
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
        description: "A custom audio track mapping audio encoding preset",
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
    let input = await jobHelper.getJobInputType(inputFile, inputUrl, namePrefix, uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    // NOTE!: This call has been modified from previous samples in this repository to now take the list of InputDefinitions instead of just the filename.
    // This passes in the IncludedTracks list to map during the Transform. 
    let job = await jobHelper.submitJobWithTrackDefinitions(transformName, jobName, input, outputAssetName, inputDefinitions);

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

