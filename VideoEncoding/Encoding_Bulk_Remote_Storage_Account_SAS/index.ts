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
    KnownEncoderNamedPreset,
    JobOutputAsset,
    JobInputHttp
} from '@azure/arm-mediaservices';
import * as jobHelper from "../../Common/Encoding/encodingJobHelpers";
import * as factory from "../../Common/Encoding/TransformFactory";
import * as blobHelper from "../../Common/Storage/blobStorage";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
// Load the .env file if it exists
import * as dotenv from "dotenv";
import { URLBuilder } from "@azure/core-http";
import { resolve } from "path/posix";
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


// ----------- BEGIN SAMPLE SETTINGS -------------------------------

// A SAS URL to a remote blob storage account that you want to read files from
// Generate a Read/List SAS token URL in the portal under the storage accounts "shared access signature" menu
// Grant the allowed resource types : Service, Container, and Object
// Grant the allowed permissions: Read, List
let remoteSasUrl: string = process.env.REMOTESTORAGEACCOUNTSAS as string;

// This is the list of file extension filters we will scan the remote blob storage account SasURL for.
// The sample can loop through containers looking for assets with these extensions and then submit them to the Transform defined below in batches of 10. 
const fileExtensionFilters: string[] = [".wmv", ".mov", ".mp4", ".mts"]

// If you want to optionally avoid copying specific output file types, you can set the postfix and extension to match in this array.
const noCopyExtensionFilters: string[] = [".ism", ".ismc", ".mpi", "_metadata.json"]

// Args
const namePrefix: string = "encodeH264";
const transformName = "BatchRemoteH264ContentAware";

// Change this flag to output all encoding to the Sas URL provided in the .env setting OUTPUTCONTAINERSAS
const outputToSas: boolean = true;
const preserveHierarchy: boolean = true; // this will preserve the source file names and source folder hierarchy in the output container
const deleteSourceAssets: boolean = true;
// If you set outputToSas to true, 
const outputContainerSas: string = process.env.OUTPUTCONTAINERSAS as string;
const outputContainerName: string = "output" // this should match the container in OUTPUTCONTAINERSAS
let batchCounter: number = 0;
// This is the batch size we chose for this sample - you can modify based on your own needs, but try not to exceed more than 50-100 in a batch unless you have contacted support first and let them know what region.
// Do that simply by opening a support ticket in the portal for increased quota and describe your scenario.
// If you need to process a bunch of stuff fast, use a busy region, like one of the major HERO regions (US East, US West, North and West Europe, etc.)
let batchSize: number = 10;

// ----------- END SAMPLE SETTINGS -------------------------------

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Configure the jobHelper to simplify the sample code
    // We use the /Common/Encoding/encodingJobHelpers.ts file to consolidate the code for job creation and submission
    // This helps to keep the main sample cleaner and avoid so much redundant code in samples
    jobHelper.setMediaServicesClient(mediaServicesClient);
    jobHelper.setAccountName(accountName);
    jobHelper.setResourceGroup(resourceGroup);


    // Create a new Standard encoding Transform for H264
    console.log(`Creating Standard Encoding transform named: ${transformName}`);

    let presetConfig: PresetConfigurations = {
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

    console.log(`Found total of ${containers.length} containers in the source location`);

    let continuationToken: string | undefined;

    console.clear();

    for (const container of containers) {
        console.log("Scanning container: ", container)
        let skipAmsAssets:boolean = true; // set this to skip over any containers that have the AMS default asset prefix of "asset-", which may be necessary if you are writing to the same storage as your AMS account

        console.group(container);
        (<any>process.stdout).cursorTo(0);
        const result = await scanContainerBatchSubmitJobs(container, fileExtensionFilters, batchSize, continuationToken, transformName, skipAmsAssets);
        console.groupCollapsed(container);
    }


    console.log("!!! Exiting the sample main(),  async awaited code paths will continue to complete in background.");
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

async function scanContainerBatchSubmitJobs(container: string, fileExtensionFilters: string[], pageSize: number, continuationToken: string | undefined, transformName: string, skipAmsAssets:boolean): Promise<string> {

    return new Promise(async (resolved, rejected) => {

        let currentContainerFileCount: number = 0;
        let currentQueueLength: number = 0;
        let nextMarker: string | undefined;

        // If skip AMS Assets is set to true, this will resolve the promise and move to the next container that does not have the prefix name of "asset-"
        // Keep in mind that you may have asset containers with custom names defined. If so, modify the prefix to match the prefix you are using in your own input and output Asset creation code.
        // Also skip anything that matches outputContainerName - so we don't re-encode our outputs if we are outputting to the same storage account
        if (skipAmsAssets || container == outputContainerName){
            if (container== outputContainerName) {
                console.log (`Skipping over the defined output container: ${outputContainerName} to avoid re-encoding your outputs`);
                resolved(container);
                return;
            }
            if (container.startsWith("asset-")){
                console.log(`Skipping over container ${container} because it matches an AMS asset container with prefix "asset-" and skip AMS assets is set to ${skipAmsAssets}.`)
                resolved(container);
                return;
            }  
        }

        (<any>process.stdout).moveCursor(-1);
        process.stdout.write(`=>`);

        try {
            let blobMatches = await blobHelper.listBlobsInContainer(container, pageSize, fileExtensionFilters, continuationToken);

            if (blobMatches !== undefined) {
                if (blobMatches.continuationToken !== undefined) {
                    continuationToken = blobMatches.continuationToken;
                }

                if (blobMatches.marker) {
                    nextMarker = blobMatches.marker;
                }

                currentContainerFileCount = blobMatches.matchCount;
                currentQueueLength = currentContainerFileCount

                // If we have no matches, continue scanning the container by pageSize
                if (blobMatches.matchCount == 0) {
                    scanContainerBatchSubmitJobs(container, fileExtensionFilters, pageSize, continuationToken, transformName, skipAmsAssets);
                }

                // Create a job queue
                let jobQueue:Job[] = [];

                // Lets Encode the current batch of blobs that we found in the current container page
                for await (const blob of blobMatches.blobItems) {
                    blobHelper.getSasUrlForBlob(container, blob.name).then(sasUrl => {
                        SubmitJobWithSaSUrlInput(sasUrl, transformName).then(job => {
                            jobQueue.push(job);

                            console.log(`The current container file match count: ${currentContainerFileCount}, currentQueueLength: ${currentQueueLength}`);

                            if (jobQueue.length == currentQueueLength) {
                                batchCounter++; // increment the batch count
                                // Wait for jobs in queue to finish before proceeding with next batch
                                jobHelper.waitForAllJobsToFinish(transformName, jobQueue, container, batchCounter).then(() => {

                                    if (outputToSas) {
                                        copyJobOutputsToDestination(jobQueue, container);
                                    }

                                    // Resolve the promise here if the pages are all completed...We know this because the next Marker will be undefined. 
                                    // If there were more pages of blobs in the current container, the next marker would contain a continuation token string 
                                    if (nextMarker === undefined) {
                                        resolved(container);
                                        return;
                                    }
                                    else {
                                        // Recurse with the continuation token for the next page of blobs in this container until complete...
                                        scanContainerBatchSubmitJobs(container, fileExtensionFilters, pageSize, continuationToken, transformName, skipAmsAssets);
                                    }
                                });
                            }
                        });
                    });
                }
            }
        } catch (err) {
            rejected(err)
        }

    })
}

function copyJobOutputsToDestination(jobQueue: Job[], container: string) {
    for (const job of jobQueue) {
        if (job.outputs) {
            let jobOutput = job.outputs[0] as JobOutputAsset; // required to cast to JobOutputAsset to access the assetName property

            let sourceFilePath: string | undefined;
            if (preserveHierarchy) {
                let inputAsset = job.input as JobInputHttp;
                sourceFilePath = getSourceFolderPathHierarchy(inputAsset, sourceFilePath, true);  // if you want to preserve the root container name in the output blob name set this to true. 
            }

            // Next we move the contents of the JobOutputAssets to the container SAS location, optional to delete Assets
            // Keep in mind that you need to use Assets for streaming - so your choice what to do here...
            //console.log(`Moving the output of job:${job.name} named: ${jobOutput.assetName} to the output container SAS location. Delete assets is set to : ${deleteSourceAssets}`)
            // To avoid copying certain files, set the noCopyExtensionFilters array to contain the list of file extensions to ignore. 
            jobHelper.moveOutputAssetToSas(jobOutput.assetName, outputContainerSas, sourceFilePath, noCopyExtensionFilters, deleteSourceAssets).then(() => {
                console.log("Done moving assets");
            });
        }
    }

    function getSourceFolderPathHierarchy(inputAsset: JobInputHttp, sourceFilePath: string | undefined, preserveContainerPath: boolean) {
        if (inputAsset.files === undefined)
            throw (new Error("InputAssets files collection is empty."));

        let inputPath = inputAsset.files[0];
        sourceFilePath = URLBuilder.parse(decodeURIComponent(inputPath)).getPath();
        if (!preserveContainerPath) {
            sourceFilePath = sourceFilePath?.split("/" + container + "/")[1];  // this will optionally remove the source root container path from the output name if required
        }else
        {
            sourceFilePath = sourceFilePath?.slice(1); // remove the root "/"
        }
        sourceFilePath = sourceFilePath?.slice(0, sourceFilePath.lastIndexOf("/")); // remove the last part of the path with the file name
        console.log("SourceFilePath=", sourceFilePath);
        return sourceFilePath;
    }
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

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    return await jobHelper.submitJob(
        transformName,
        jobName,
        input,
        outputAssetName);
}

