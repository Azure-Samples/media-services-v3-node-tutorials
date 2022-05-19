// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    KnownEncoderNamedPreset,
    PresetConfigurations,
    KnownComplexity,
    KnownInterleaveOutput
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
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "contentAware264Constrained";
const transformName = "H264EncodingContentAwareConstrained";

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

    // This sample uses constraints on the CAE encoding preset to reduce the number of tracks output and resolutions to a specific range. 
    // First we will create a PresetConfigurations object to define the constraints that we want to use
    // This allows you to configure the encoder settings to control the balance between speed and quality. Example: set Complexity as Speed for faster encoding but less compression efficiency.

    let presetConfig : PresetConfigurations = {
        complexity: KnownComplexity.Balanced, // Content Aware encoding is the same rate for Speed, Balanced or Quality, unlike custom presets with Speed.
        // The output includes both audio and video.
        interleaveOutput: KnownInterleaveOutput.InterleavedOutput,
        // The key frame interval in seconds. Example: set as 2 to reduce the playback buffering for some players.
        keyFrameIntervalInSeconds: 2,
        // The maximum bitrate in bits per second (threshold for the top video layer). Example: set MaxBitrateBps as 6000000 to avoid producing very high bitrate outputs for contents with high complexity.
        maxBitrateBps: 6000000,
        // The minimum bitrate in bits per second (threshold for the bottom video layer). Example: set MinBitrateBps as 200000 to have a bottom layer that covers users with low network bandwidth.
        minBitrateBps: 200000,
        maxHeight: 720,
        // The minimum height of output video layers. Example: set MinHeight as 360 to avoid output layers of smaller resolutions like 180P.
        minHeight: 270,
        // The maximum number of output video layers. Example: set MaxLayers as 4 to make sure at most 4 output layers are produced to control the overall cost of the encoding job.
        maxLayers: 3
    }

    // Create a new Content Aware Encoding Preset using the preset configuration
    let transformOutput: TransformOutput[] = [{
        // What should we do with the job if there is an error?
        onError: KnownOnErrorType.StopProcessingJob,
        // What is the relative priority of this job to others? Normal, high or low?
        relativePriority: KnownPriority.Normal,
        preset: factory.createBuiltInStandardEncoderPreset({
            presetName: KnownEncoderNamedPreset.ContentAwareEncoding,
            // Configurations can be used to control values used by the Content Aware Encoding Preset.
            configurations: presetConfig
            })
        }
    ];

    console.log("Creating encoding transform...");

    let transform: Transform = {
        name: transformName,
        description: "H264 content aware encoding with configuration settings",
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
    let input = await jobHelper.getJobInputType(inputFile,inputUrl,namePrefix,uniqueness);
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