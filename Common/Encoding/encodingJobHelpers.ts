import {
    AzureMediaServices,
    InputFile,
    JobInputAsset,
    JobInputHttp,
    JobInputs,
    JobOutputAsset,
    AssetContainerPermission,
    JobsGetResponse,
    JobInputUnion,
    PresetUnion,
    InputDefinitionUnion,
    Job
} from "@azure/arm-mediaservices"
import * as factory from "../Encoding/TransformFactory";
import { createBlobClient } from "../Storage/blobStorage";
import { BlobServiceClient, AnonymousCredential,  Metadata, BlobItem} from "@azure/storage-blob";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';
import { URLBuilder } from "@azure/core-http";


let mediaServicesClient: AzureMediaServices;
let accountName: string;
let resourceGroup: string
let remoteStorageSas:string;


export function setMediaServicesClient(client: AzureMediaServices) {
    mediaServicesClient = client;
}

export function setAccountName(account: string) {
    accountName = account;
}

export function setResourceGroup(groupName: string) {
    resourceGroup = groupName
}

export function setRemoteStorageSas(remoteSasUrl:string){
    remoteStorageSas = remoteSasUrl;
}

export async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string, correlationData?: { [propertyname: string]: string }, presetOverride?: PresetUnion): Promise<Job> {
    if (outputAssetName == undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }
    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName,
            presetOverride: presetOverride
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInput,
        outputs: jobOutputs,
        // Pass in custom correlation data to match up to your customer tenants, or any custom job tracking information you wish to log in the event grid events
        correlationData: correlationData,

    });

}

export async function submitJobMultiOutputs(transformName: string, jobName: string, jobInput: JobInputUnion, jobOutputs: JobOutputAsset[], correlationData?: { [propertyname: string]: string }) {

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInput,
        outputs: jobOutputs,
        // Pass in custom correlation data to match up to your customer tenants, or any custom job tracking information you wish to log in the event grid events
        correlationData: correlationData,

    });

}

export async function submitJobMultiInputs(transformName: string, jobName: string, jobInputs: JobInputUnion[], outputAssetName: string, correlationData?: { [propertyname: string]: string }, presetOverride?: PresetUnion) {
    if (outputAssetName == undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }
    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName,
            presetOverride: presetOverride
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: factory.createJobInputs({
            inputs: jobInputs
        }),
        outputs: jobOutputs,
        // Pass in custom correlation data to match up to your customer tenants, or any custom job tracking information you wish to log in the event grid events
        correlationData: correlationData,

    });

}

export async function submitJobWithInputSequence(transformName: string, jobName: string, inputAssets: JobInputAsset[], outputAssetName: string) {
    if (outputAssetName === undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }

    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName
        })
    ];

    // Create the job input sequence passing the list of assets to it.
    let jobInputSequence = factory.createJobInputSequence({
        inputs: inputAssets
    })


    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInputSequence,
        outputs: jobOutputs
    });

}

export async function submitJobWithTrackDefinitions(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string, inputDefinitions: InputDefinitionUnion[]) {
    if (outputAssetName == undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }

    let jobInputWithTrackDefinitions = jobInput as JobInputAsset;
    jobInputWithTrackDefinitions.inputDefinitions = inputDefinitions;

    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInputWithTrackDefinitions,
        outputs: jobOutputs
    });

}

// Creates a new Media Services Asset, which is a pointer to a storage container
// Uses the Storage Blob npm package to upload a local file into the container through the use 
// of the SAS URL obtained from the new Asset object.  
// This demonstrates how to upload local files up to the container without require additional storage credential.
export async function createInputAsset(assetName: string, fileToUpload: string) {
    let uploadSasUrl: string;
    let fileName: string;
    let sasUri: url.URLRecord | null;

    let asset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, assetName, {});
    let date = new Date();
    let readWritePermission: AssetContainerPermission = "ReadWrite";

    date.setHours(date.getHours() + 1);
    let input = {
        permissions: readWritePermission,
        expiryTime: date
    }

    let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);
    if (listContainerSas.assetContainerSasUrls) {
        uploadSasUrl = listContainerSas.assetContainerSasUrls[0];
        fileName = path.basename(fileToUpload);
        sasUri = url.parseURL(uploadSasUrl);

        // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
        const anonymousCredential = new AnonymousCredential();
        let blobClient = new BlobServiceClient(uploadSasUrl, anonymousCredential)
        // We need to get the containerName here from the SAS URL path to use later when creating the container client
        let containerName = sasUri?.path[0];
        console.log(`Uploading file named ${fileName} to blob in the Asset's container...`);

        // Get the blob container client using the empty string to use the same container as the SAS URL points to.
        // Otherwise, adding a name here creates a sub folder, which will break the analysis. 
        let containerClient = blobClient.getContainerClient('');
        // Next gets the blockBlobClient needed to use the uploadFile method
        let blockBlobClient = containerClient.getBlockBlobClient(fileName);

        // Parallel uploading with BlockBlobClient.uploadFile() in Node.js runtime
        // BlockBlobClient.uploadFile() is only available in Node.js and not in Browser
        await blockBlobClient.uploadFile(fileToUpload, {
            blockSize: 4 * 1024 * 1024, // 4MB Block size
            concurrency: 20, // 20 concurrent
            onProgress: (ev) => console.log(ev)
        });

    }

    return asset;
}

export async function waitForJobToFinish(transformName: string, jobName: string) {
    let timeout = new Date();
    // Timer values
    const timeoutSeconds: number = 60 * 10;
    const sleepInterval: number = 1000 * 2;
    const setTimeoutPromise = util.promisify(setTimeout);

    timeout.setSeconds(timeout.getSeconds() + timeoutSeconds);


    async function pollForJobStatus(): Promise<JobsGetResponse> {
        let job = await mediaServicesClient.jobs.get(resourceGroup, accountName, transformName, jobName);

        // Note that you can report the progress for each Job output if you have more than one. In this case, we only have one output in the Transform
        // that we defined in this sample, so we can check that with the job.outputs[0].progress parameter.
        if (job.outputs != undefined) {
            console.log(`Job State is : ${job.state},  Progress: ${job.outputs[0].progress}%`);
        }

        if (job.state == 'Finished' || job.state == 'Error' || job.state == 'Canceled') {

            return job;
        } else if (new Date() > timeout) {
            console.log(`Job ${job.name} timed out. Please retry or check the source file.`);
            return job;
        } else {

            await setTimeoutPromise(sleepInterval, null);
            return pollForJobStatus();
        }
    }

    return await pollForJobStatus();
}

export async function waitForAllJobsToFinish(transformName: string, jobQueue: Job[], currentContainer: string, batchCounter: number) {

    const sleepInterval: number = 1000 * 10;
    const setTimeoutPromise = util.promisify(setTimeout);

    let batchProcessing: boolean = true

    while (batchProcessing) {
        let errorCount = 0;
        let finishedCount = 0;
        let processingCount = 0;
        let outputRows = [];

        for await (const jobItem of jobQueue) {
            if (jobItem.name !== undefined) {
                let job = await mediaServicesClient.jobs.get(resourceGroup, accountName, transformName, jobItem.name);

                if (job.outputs != undefined) {
                    outputRows.push(
                        {
                            Start: (job.startTime === undefined) ? "starting" : job.startTime.toLocaleTimeString(undefined, { timeStyle: "medium", hour12: false }),
                            Job: job.name,
                            State: job.state,
                            Progress: job.outputs[0].progress,
                            End: (job.endTime === undefined) ? "---" : job.endTime?.toLocaleTimeString(undefined, { timeStyle: "medium", hour12: false })
                        });
                }
                if (job.state == 'Error' || job.state == 'Canceled') {
                    if (job.input) {
                        updateJobInputMetadata(job.input, { "ams_encoded": "false", "ams_status": job.state});
                    }
                    errorCount++;
                }
                else if (job.state == 'Finished') {
                    // Update the source blob metadata to note that we encoded it already, the date it was encoded, and the transform name used
                    if (job.input) {
                        updateJobInputMetadata(job.input, 
                            { 
                            "ams_encoded": "true", 
                            "ams_status": job.state, 
                            "ams_encodedDate": new Date().toUTCString(),
                            "ams_transform" : transformName
                        });
                    }
                    finishedCount++;
                }
                else if (job.state == 'Processing' || job.state == 'Scheduled')
                    processingCount++;
            }
        }

        console.log(`\n----------------------------------------\tENCODING BATCH  #${batchCounter}       ----------------------------------------------------`);
        console.log(`Current Container: ${currentContainer}`)
        console.log(`Encoding batch size: ${jobQueue.length}\t Processing: ${processingCount}\t Finished: ${finishedCount}\t Error:${errorCount} `)
        console.log(`-------------------------------------------------------------------------------------------------------------------------------`);
        console.table(outputRows);


        // If the count of finished and errored jobs add up to the length of the queue batch, then break out. 
        if (finishedCount + errorCount == jobQueue.length)
            batchProcessing = false;

        await setTimeoutPromise(sleepInterval);
    }
}

export async function updateJobInputMetadata(jobInput: JobInputHttp | JobInputAsset | JobInputUnion, metadata: Metadata) {

    if (jobInput as JobInputHttp) {
        let input = jobInput as JobInputHttp;
        if (input.files) {

            let sasUri =  URLBuilder.parse(remoteStorageSas);
            let sasQuery = sasUri.getQuery()?.toString();
            let blobUri = URLBuilder.parse(input.files[0]);
            blobUri.setQuery(sasQuery);

            // This sample assumes that the input files URL [0] is a SAS URL.
            // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
            let blobClient = createBlobClient(blobUri.toString()); // at this point we are assuming this is a SAS URL and not just any HTTPS URL. 


            try {
                await blobClient.setMetadata(metadata);
            } catch (error) {
                console.error(`Error updating the metadata on the JobInput.  Please check to make sure that the source SAS URL allows writes to update metadata`);
                // console.log (error);
            }
           
        }
    }
}

export async function downloadResults(assetName: string, resultsFolder: string) {
    let date = new Date();
    let readPermission: AssetContainerPermission = "Read";

    date.setHours(date.getHours() + 1);
    let input = {
        permissions: readPermission,
        expiryTime: date
    }
    let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);

    if (listContainerSas.assetContainerSasUrls) {
        let containerSasUrl = listContainerSas.assetContainerSasUrls[0];
        let sasUri = url.parseURL(containerSasUrl);

        // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
        const anonymousCredential = new AnonymousCredential();
        let blobClient = new BlobServiceClient(containerSasUrl, anonymousCredential)
        // We need to get the containerName here from the SAS URL path to use later when creating the container client
        let containerName = sasUri?.path[0];
        let directory = path.join(resultsFolder, assetName);
        console.log(`Downloading output into ${directory}`);

        // Get the blob container client using the container name on the SAS URL path
        // to access the blockBlobClient needed to use the uploadFile method
        let containerClient = blobClient.getContainerClient('');

        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch (err) {
            // directory exists
            // console.log(err);
        }
        console.log(`Listing blobs in container ${containerName}...`);
        console.log("Downloading blobs to local directory in background...");
        let i = 1;
        for await (const blob of containerClient.listBlobsFlat({includeMetadata:true})) {
            console.log(`Blob ${i++}: ${blob.name}`);

            let blockBlobClient = containerClient.getBlockBlobClient(blob.name);
            await blockBlobClient.downloadToFile(path.join(directory, blob.name), 0, undefined,
                {
                    abortSignal: AbortController.timeout(30 * 60 * 1000),
                    maxRetryRequests: 2,
                    onProgress: (ev) => console.log(ev)
                }).then(() => {
                    console.log(`Download file complete`);
                });

        }
    }
}

// Selects the JobInput type to use based on the value of inputFile or inputUrl. 
// Set inputFile to null to create a Job input that sources from an HTTP URL path
// Creates a new input Asset and uploads the local file to it before returning a JobInputAsset object
// Returns a JobInputHttp object if inputFile is set to null, and the inputUrl is set to a valid URL
export async function getJobInputType(inputFile: string | undefined, inputUrl: string, namePrefix: string, uniqueness: string): Promise<JobInputUnion> {
    if (inputFile !== undefined) {
        let assetName: string = namePrefix + "-input-" + uniqueness;
        await createInputAsset(assetName, inputFile);
        return factory.createJobInputAsset({
            assetName: assetName
        })
    } else {
        return factory.createJobInputHttp({
            files: [inputUrl]
        })
    }
}


export async function createStreamingLocator(assetName: string, locatorName: string) {
    let streamingLocator = {
        assetName: assetName,
        streamingPolicyName: "Predefined_ClearStreamingOnly"  // no DRM or AES128 encryption protection on this asset. Clear means not encrypted.
    };

    let locator = await mediaServicesClient.streamingLocators.create(
        resourceGroup,
        accountName,
        locatorName,
        streamingLocator);

    return locator;
}


export async function getStreamingUrls(locatorName: string) {
    // Make sure the streaming endpoint is in the "Running" state on your account
    let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, "default");

    let paths = await mediaServicesClient.streamingLocators.listPaths(resourceGroup, accountName, locatorName);
    if (paths.streamingPaths) {
        paths.streamingPaths.forEach(path => {
            path.paths?.forEach(formatPath => {
                let manifestPath = "https://" + streamingEndpoint.hostName + formatPath
                console.log(manifestPath);
                console.log(`Click to playback in AMP player: http://ampdemo.azureedge.net/?url=${manifestPath}`)
            });
        });
    }
}


// This method builds the manifest URL from the static values used during creation of the Live Output.
// This allows you to have a deterministic manifest path. <streaming endpoint hostname>/<streaming locator ID>/manifestName.ism/manifest(<format string>)
export async function buildManifestPaths(streamingLocatorId: string | undefined, manifestName: string, filterName: string | undefined, streamingEndpointName: string) {
    const hlsFormat: string = "format=m3u8-cmaf";
    const dashFormat: string = "format=mpd-time-cmaf";

    // Get the default streaming endpoint on the account
    let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, streamingEndpointName);

    if (streamingEndpoint?.resourceState !== "Running") {
        console.log(`Streaming endpoint is stopped. Starting the endpoint named ${streamingEndpointName}`);
        await mediaServicesClient.streamingEndpoints.beginStartAndWait(resourceGroup, accountName, streamingEndpointName, {

        })
            .then(() => {
                console.log("Streaming Endpoint Started.");
            })

    }

    let manifestBase = `https://${streamingEndpoint.hostName}/${streamingLocatorId}/${manifestName}.ism/manifest`

    let hlsManifest: string;

    if (filterName === undefined) {
        hlsManifest = `${manifestBase}(${hlsFormat})`;
    } else {
        hlsManifest = `${manifestBase}(${hlsFormat},filter=${filterName})`;
    }
    console.log(`The HLS (MP4) manifest URL is : ${hlsManifest}`);
    console.log("Open the following URL to playback the live stream in an HLS compliant player (HLS.js, Shaka, ExoPlayer) or directly in an iOS device");
    console.log(`${hlsManifest}`);
    console.log();

    let dashManifest: string;
    if (filterName === undefined) {
        dashManifest = `${manifestBase}(${dashFormat})`;
    } else {
        dashManifest = `${manifestBase}(${dashFormat},filter=${filterName})`;
    }

    console.log(`The DASH manifest URL is : ${dashManifest}`);
    console.log("Open the following URL to playback the live stream from the LiveOutput in the Azure Media Player");
    console.log(`https://ampdemo.azureedge.net/?url=${dashManifest}&heuristicprofile=lowlatency`);
    console.log();
}

export async function moveOutputAssetToSas(assetName: string, sasUrl: string, sourceFilePath: string | undefined, noCopyExtensionFilters: string[], deleteAssetsOnCopy: boolean) {
    let date = new Date();
    let readWritePermission: AssetContainerPermission = "ReadWrite";
    let baseFileName :string = "";

    try {

        date.setHours(date.getHours() + 1);
        let listSasInput = {
            permissions: readWritePermission,
            expiryTime: date
        }

        let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, listSasInput);
        if (listContainerSas.assetContainerSasUrls) {
            let assetContainerSas = listContainerSas.assetContainerSasUrls[0];

            // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
            const anonymousCredential = new AnonymousCredential();
            // Get a Blob client for the source asset container and the provided destination container in the remote storage location
            let sourceBlobClient = new BlobServiceClient(assetContainerSas, anonymousCredential);
            let destinationBlobClient = new BlobServiceClient(sasUrl, anonymousCredential);

            console.log(`Moving output from ${assetName}`);

            // Get the blob container client using the empty string to use the same container as the SAS URL points to.
            // Otherwise, adding a name here creates a sub folder
            let sourceContainerClient = sourceBlobClient.getContainerClient('');
            let destinationContainerClient = destinationBlobClient.getContainerClient('');

            let blobs = await sourceContainerClient.listBlobsFlat({includeCopy:true, includeUncommitedBlobs:true});
            
            let blobItemsFiltered :BlobItem []= [];

            // First we loop through the asset blobs and do our business logic
            // We want to filter out the unwanted blobs, and also store the base file name to use 
            // when renaming the default Content Aware Encoding preset Thumbnail if it exists. 
            for await (const blob of blobs){
                // This will grab the GUID on the metadata file and use it for the Thumbnail file name if that exists.
                // This is mostly a workaround to deal with the fact that the CAE preset outputs the same Thumbnail000001.jpg name for every encode
    
                if (blob.name.indexOf('_manifest') >-1) {
                    baseFileName = blob.name.split("_manifest")[0];
                }

                let skipCopy: boolean = false;
                // if the blob is on the no copy list, skip it...don't copy to output
                for (const noCopyExtension of noCopyExtensionFilters) {
                    if (blob.name.endsWith(noCopyExtension)) {
                        skipCopy = true;
                    }
                }

                if (skipCopy) // if we found an extension above, continue withe the next blob
                    continue;

                blobItemsFiltered.push(blob);
            };

            
            for await (const blob of blobItemsFiltered) {

                //let blockBlobClient = sourceContainerClient.getBlockBlobClient(blob.name);
                // Lease the blob to prevent anyone else using it... throwing exception here -  UnhandledPromiseRejectionWarning: Unhandled promise rejection
                //let lease = sourceContainerClient.getBlobLeaseClient(blob.name).acquireLease(60);
                //console.log ("Lease state:", (await blockBlobClient.getProperties()).leaseState);

                // Create a destination Block Blob with the same name, unless the outputFolder is set to preserve the source hierarchy. 
                let destinationBlobName: string;
                let blobCopyName:string;

                // Special case to rename the CAE preset default thumbnail, which cannot be changed in the preset transform settings. 
                // This will use the GUID from the metadata file as the prefix name instead
                if (blob.name.indexOf("Thumbnail000001") >-1 && baseFileName !==""){
                    blobCopyName = baseFileName +"_thumbnail000001.jpg";
                }else{
                    blobCopyName = blob.name;
                }

                if (sourceFilePath) {
                    destinationBlobName = `${sourceFilePath}/${blobCopyName}`;
                    
                } else {
                    destinationBlobName =blobCopyName;
                }

                let destinationBlob = destinationContainerClient.getBlockBlobClient(destinationBlobName);

                let sasUrlBuilder = URLBuilder.parse(assetContainerSas);
                sasUrlBuilder.appendPath(blob.name);

                // Copy the source into the destinationBlob and poll until done
                const copyPoller = await destinationBlob.beginCopyFromURL(sasUrlBuilder.toString())
                const result = await copyPoller.pollUntilDone();

                if (result.errorCode)
                    console.log(`ERROR copying the blob ${blob.name} in asset ${assetName}`)
                else
                    console.log(`${date.toLocaleTimeString(undefined, { timeStyle: "medium", hour12: false })} FINISHED copying blob ${destinationBlobName} from asset ${assetName} to destination`)
            }

            // Once all are copied, we delete the source asset if set to true.
            if (deleteAssetsOnCopy) {
                // Delete the source Asset here.
                await mediaServicesClient.assets.delete(resourceGroup, accountName, assetName);
                console.log(`${date.toLocaleTimeString(undefined, { timeStyle: "medium", hour12: false })} DELETED the source asset:${assetName}`);
            }
        }

    } catch (err) {
        console.log(err);
    }

}