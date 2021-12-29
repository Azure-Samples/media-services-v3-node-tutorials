// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    Job,
    PresetConfigurations,
    KnownComplexity,
    KnownInterleaveOutput,
    KnownEncoderNamedPreset
} from '@azure/arm-mediaservices';
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
import * as factory from "../../Common/Encoding/TransformFactory";
import * as blobHelper from "../../Common/Storage/blobStorage";
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


// A SAS URL to a remote blob storage account that you want to read files from
// Generate a Read/List SAS token URL in the portal under the storage accounts "shared access signature" menu
// Grant the allowed resource types : Service, Container, and Object
// Grant the allowed permissions: Read, List
let remoteSasUrl: string = process.env.REMOTESTORAGEACCOUNTSAS as string;

// This is the list of file extension filters we will scan the remote blob storage account SasURL for.
// The sample can loop through containers looking for assets with these extensions and then submit them to the Transform defined below in batches of 10. 
const fileExtensionFilters : string[] = [".wmv", ".mov", ".mp4"] 

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encodeH264";

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "BatchRemoteH264ContentAware";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Configure the jobHelper to simplify the sample code
    // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
    // This helps to keep the main sample cleaner and avoid so much redundant code in samples
    jobHelper.setMediaServicesClient(mediaServicesClient);
    jobHelper.setAccountName(accountName);
    jobHelper.setResourceGroup(resourceGroup);


    // Create a new Standard encoding Transform for H264
    console.log(`Creating Standard Encoding transform named: ${transformName}`);

    let presetConfig : PresetConfigurations = {
        complexity: KnownComplexity.Quality,
        // The output includes both audio and video.
        interleaveOutput: KnownInterleaveOutput.InterleavedOutput,
        // The key frame interval in seconds. Example: set as 2 to reduce the playback buffering for some players.
        keyFrameIntervalInSeconds: 2,
        // The maximum bitrate in bits per second (threshold for the top video layer). Example: set MaxBitrateBps as 6000000 to avoid producing very high bitrate outputs for contents with high complexity.
        maxBitrateBps: 6000000,
        // The minimum bitrate in bits per second (threshold for the bottom video layer). Example: set MinBitrateBps as 200000 to have a bottom layer that covers users with low network bandwidth.
        minBitrateBps: 200000,
        maxHeight: 1080,
        // The minimum height of output video layers. Example: set MinHeight as 360 to avoid output layers of smaller resolutions like 180P.
        minHeight: 360,
        // The maximum number of output video layers. Example: set MaxLayers as 4 to make sure at most 4 output layers are produced to control the overall cost of the encoding job.
        maxLayers: 1
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


    // Now we are going to use the Sas URL to the storage account to loop through all the containers and find video files
    // with the extensions that we want to encode from.  We can also use tags, or other metadata by modifying the code in the blobHelper library. 

    // First we need to create the blob service client with a SaS URL to the storage account. See settings for this at top of file. 
    blobHelper.createBlobServiceClient(remoteSasUrl);

    // Next we are going to get a list of all the containers in this storage account.
    // For large accounts, you may need to modify this code to support pagination through the list of containers, as there is a default limit returned
    let containers: string[] = await blobHelper.listStorageContainers();

    // Next we will loop through each container looking for the file types we want to encode and then submit the encoding jobs using JobInputHTTP types

    let token: string | undefined;

    containers.forEach(container => {

        // This is the batch size we chose for this sample - you can modify based on your own needs, but try not to exceed more than 50-100 in a batch unless you have contacted support first and let them know what region.
        // Do that simply by opening a support ticket in the portal for increased quota and describe your scenario.
        // If you need to process a bunch of staff fast, use a busy region, like one of the major HERO regions (US East, US West, North and West Europe, etc.)
        let batchSize: number = 10; 
        let jobQueue: Job[] = [];

        // This function will scan the remote SAS URL storage account container for files with the defined extensions in fileExtensions filter and then
        // it will submit an encoding job to the transform created above. It will wait for the batch size to complete encoding before continuing and output the progress
        // to the console. 
        scanContainerBatchSubmitJobs(container, fileExtensionFilters, batchSize, token, transformName, jobQueue);

    });

}


main().catch((err) => {

    console.error("Error running sample:", err.message);
    console.error(`Error code: ${err.code}`);

    if (err.name == 'RestError') {

        if (err.code == "AuthenticationFailed") {
            console.error("Check the SAS URL you provided or re-create a new one that has the right permission grants and expiration dates");
            console.error("\tGenerate a Read/List SAS token URL in the portal under the storage accounts shared access signature menu");
            console.error("\tGrant the allowed resource types : Service, Container, and Object");
            console.error("\tGrant the allowed permissions: Read, List");
        }
        else {
            // General REST API Error message
            console.error("Error request:\n\n", err.request);
        }
    }

});

async function scanContainerBatchSubmitJobs(container: string, fileExtensionFilters:string[],batchSize: number, token: string | undefined, transformName: string, jobQueue: Job[]) {
    blobHelper.listBlobsInContainer(container, batchSize, fileExtensionFilters, token).then(value => {

        if (value !== undefined) {
            //console.log("Continuation token:", value);
            if (value.continuationToken !== undefined) {
                token = value.continuationToken;
            } 

            value.blobItems.forEach(blob => {
                blobHelper.getSasUrlForBlob(container, blob.name).then(sasUrl => {
                    //console.log(sasUrl);
                    SubmitJobWithSaSUrlInput(sasUrl, transformName).then(job => {
                        jobQueue.push(job);

                        if (jobQueue.length == batchSize) {
                            // Wait for jobs in queue to finish before proceeding with next batch
                            jobHelper.waitForAllJobsToFinish(transformName, jobQueue).then(() => {
                                scanContainerBatchSubmitJobs(container, fileExtensionFilters, batchSize,token,transformName, []);
                            });
                        }
                    });

                });
            });


        }

    });
    return { token };
}

async function SubmitJobWithSaSUrlInput(sasUrl: string, transformName: string): Promise<Job> {
    let uniqueness = uuidv4();
    let input = await jobHelper.getJobInputType(
        undefined,
        sasUrl,
        namePrefix,
        uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");
    console.log("Output Asset Name:", outputAssetName);
    console.log("JobName:", jobName);

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    return await jobHelper.submitJob(
        transformName,
        jobName,
        input,
        outputAssetName);
}

