// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// This sample shows how to copy a section of a live event archive (output from the LiveOutput) to an MP4 file for use in downstream applications
// It is also useful to use this technique to get a file that you can submit to YouTube, Facebook, or other social platforms.
// The output from this can also be submitted to the Video Indexer service, which currently does not support ingest of AMS live archives
//
// The key concept to know in this sample is the VideoTrackDescriptor that allows you to extract a specific bitrate from a live archive ABR set. 


import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    FromAllInputFile,
    VideoTrackDescriptor,
    FromEachInputFile,
    SelectVideoTrackByAttribute,
    KnownTrackAttribute,
    KnownFilterTrackPropertyType,
    KnownTrackPropertyCompareOperation,
    KnownTrackPropertyType,
    KnownAttributeFilter,
} from '@azure/arm-mediaservices';
import * as factory  from "../../Common/Encoding/transformFactory";
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
let inputFile: string;

//  Set this to the name of the Asset used in your LiveOutput. This would be the archived live event Asset name. 
let inputArchiveName: string = "archiveAssetdf10bb3a";

// Args
const outputFolder: string = "./Output"; // the local folder to download results into
const namePrefix: string = "encode_copy_live"; // the prefix for output file names
const transformName = "CopyLiveArchiveToMP4"; // the transform name

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
        preset:  factory.createStandardEncoderPreset({
            codecs: [
                factory.createCopyAudio({}),
                factory.createCopyVideo({}),
            ],
            filters: {
            },
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
        description: "Built in preset using the Saas Copy Codec preset. This copies the source audio and video to an MP4 file.",
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
//<TopBitRate>
    // Use this to select the top bitrate from the live archive asset 
    // The filter property allows you to select tht "Top" bitrate which would be the highest bitrate provided by the live encoder.
    let videoTrackSelection: SelectVideoTrackByAttribute = {
        odataType:"#Microsoft.Media.SelectVideoTrackByAttribute",
        attribute: KnownTrackAttribute.Bitrate,
        filter: KnownAttributeFilter.Top // use this to select the top bitrate in this ABR asset for the job
    }
//</TopBitRate>
//<SubclipJobInput>
    // Create a job input asset that points to the live event archive to be packaged to MP4 format.
    // This is where we set up the track selection and optionally set a clip trimming on the live event to clip off start and end positions.
    let input =  factory.createJobInputAsset({
        assetName: inputArchiveName,
        start: {
            odataType:"#Microsoft.Media.AbsoluteClipTime",
            time: "PT30S" // Trim the first 30 seconds off the live archive.
        },
        end : {
            odataType:"#Microsoft.Media.AbsoluteClipTime",
            time: "PT5M30S" // Clip off the end after 5 minutes and 30 seconds.
        },
        inputDefinitions: [
            factory.createFromAllInputFile({
                includedTracks: [
                    videoTrackSelection  // Pass in the SelectVideoTrackByAttribute object created above to select only the top video. 
                ]
            })
        ]
    })
//</SubclipJobInput>
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    let job = await jobHelper.submitJob(transformName, jobName, input, outputAssetName);

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
