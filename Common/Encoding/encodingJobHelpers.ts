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
    InputDefinitionUnion
} from "@azure/arm-mediaservices"
import * as factory  from "../Encoding/TransformFactory";
import { BlobServiceClient, AnonymousCredential } from "@azure/storage-blob";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';

let mediaServicesClient :AzureMediaServices;
let accountName :string;
let resourceGroup:string

export function setMediaServicesClient(client:AzureMediaServices){
 mediaServicesClient = client;
}

export function setAccountName(account:string) {
    accountName= account;
}

export function setResourceGroup(groupName:string){
    resourceGroup = groupName
}

export async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string, correlationData?:{[propertyname:string]:string}, presetOverride?: PresetUnion) {
    if (outputAssetName == undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }
    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName,
            presetOverride:presetOverride
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInput,
        outputs: jobOutputs,
        // Pass in custom correlation data to match up to your customer tenants, or any custom job tracking information you wish to log in the event grid events
        correlationData: correlationData,
        
    });

}

export async function submitJobMultiOutputs(transformName: string, jobName: string, jobInput: JobInputUnion, jobOutputs: JobOutputAsset[], correlationData?:{[propertyname:string]:string}) {

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInput,
        outputs: jobOutputs,
        // Pass in custom correlation data to match up to your customer tenants, or any custom job tracking information you wish to log in the event grid events
        correlationData: correlationData,
        
    });

}

export async function submitJobMultiInputs(transformName: string, jobName: string, jobInputs: JobInputUnion[], outputAssetName: string, correlationData?:{[propertyname:string]:string}, presetOverride?: PresetUnion) {
    if (outputAssetName == undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }
    let jobOutputs: JobOutputAsset[] = [
        factory.createJobOutputAsset({
            assetName: outputAssetName,
            presetOverride:presetOverride
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: factory.createJobInputs({
            inputs : jobInputs
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
        inputs:inputAssets
    })

    // BUG: This is failing to submit the job currently due to a bug in serialization/deserialization logic in the JS SDK that removes 
    //      the assetName properties from the JobInputAssets in the JobInputSequence
    //      This will get fixed with the PR here on the JS SDK - https://github.com/Azure/azure-sdk-for-js/pull/19455
    
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
            console.log(err);
        }
        console.log(`Listing blobs in container ${containerName}...`);
        console.log("Downloading blobs to local directory in background...");
        let i = 1;
        for await (const blob of containerClient.listBlobsFlat()) {
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
export async function getJobInputType( inputFile:string, inputUrl:string,namePrefix:string, uniqueness: string): Promise<JobInputUnion> {
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
        streamingPolicyName: "Predefined_ClearStreamingOnly"  // no DRM or AES128 encryption protection on this asset. Clear means unencrypted.
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

