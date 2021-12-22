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
import * as factory from "../../Common/Encoding/TransformFactory";
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string = "Media\\surround-audio.mp4"; // provide a sample file with 8 discrete audio tracks as layout is defined above. Path is relative to the working directory for Node.js
let inputFileName: string = "surround-audio.mp4"
// This is a hosted sample file to use
let inputUrl: string;

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encodeH264_multi_channel";

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "Custom_AAC_MultiChannel_Surround";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Configure the jobHelper to simplify the sample code
    // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
    // This helps to keep the main sample cleaner and avoid so much redundant code in samples
    jobHelper.setMediaServicesClient(mediaServicesClient);
    jobHelper.setAccountName(accountName);
    jobHelper.setResourceGroup(resourceGroup);

    // Create a new Standard encoding Transform for H264
    console.log(`Creating Standard Encoding transform named: ${transformName}`);

    // The multi-channel audio file should contain a stereo pair on tracks 1 and 2, followed by multi channel 5.1 discrete tracks in the following layout
    // 1. Left stereo
    // 2. Right stereo
    // 3. Left front surround
    // 4. Right front surround
    // 5. Center surround
    // 6. Low frequency
    // 7. Back left 
    // 8. Back right
    //
    // The channel mapping support is limited to only outputting a single AAC stereo track, followed by a 5.1 audio AAC track in this sample. 

    // The Transform we created outputs two tracks, the first track is mapped to the 2 stereo inputs followed by the 5.1 audio tracks. 
    let trackList: TrackDescriptorUnion[] = [
        factory.createSelectAudioTrackById({
            trackId: 0,
            channelMapping: KnownChannelMapping.StereoLeft
        }),
        factory.createSelectAudioTrackById(
            {
                trackId: 1,
                channelMapping: KnownChannelMapping.StereoRight
            }),
        factory.createSelectAudioTrackById({
            trackId: 2,
            channelMapping: KnownChannelMapping.FrontLeft
        }),
        factory.createSelectAudioTrackById(
            {
                trackId: 3,
                channelMapping: KnownChannelMapping.FrontRight
            }),
        factory.createSelectAudioTrackById({
            trackId: 4,
            channelMapping: KnownChannelMapping.Center
        }),
        factory.createSelectAudioTrackById({
            trackId: 5,
            channelMapping: KnownChannelMapping.LowFrequencyEffects
        }),
        factory.createSelectAudioTrackById({
            trackId: 6,
            channelMapping: KnownChannelMapping.BackLeft
        }),
        factory.createSelectAudioTrackById({
            trackId: 7,
            channelMapping: KnownChannelMapping.BackRight
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
                }),
                factory.createAACaudio({
                    channels: 6, // the 5.1 surround sound mapped output track
                    samplingRate: 48000,
                    bitrate: 320000,
                    profile: KnownAacAudioProfile.AacLc,
                    label: "surround"
                })
            ],
            // Specify the format for the output files - one for AAC audio outputs to MP4
            formats: [
                // Mux the AAC audio into MP4 files, using basename, label, bitrate and extension macros
                // Note that since you have multiple AAC outputs defined above, you have to use a macro that produces unique names per AAC Layer
                // Either {Label} or {Bitrate} should suffice
                // By creating outputFiles and assigning the labels we can control which output tracks are muxed into the Mp4 files
                // If you choose to mux both the stereo and surround tracks into a single MP4 output, you can remove the outputFiles and remove the second MP4 format object. 
                factory.createMp4Format({
                    filenamePattern: "{Basename}-{Label}-{Bitrate}{Extension}",
                    outputFiles: [
                        { labels: ["stereo"] },  // Output one MP4 file with the stereo track in it. 
                        { labels: ["surround"] }, // Output a second Mp4 file with the surround sound track in it 
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
        description: "A custom multi-channel audio encoding preset",
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
    let input = await jobHelper.getJobInputType(inputFile, inputUrl, namePrefix,uniqueness);
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
    console.error (`Error code: ${err.code}`);
  
    if (err.name == 'RestError'){
        // REST API Error message
        console.error("Error request:\n\n", err.request);
    }
  
  });

