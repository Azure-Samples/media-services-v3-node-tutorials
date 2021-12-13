// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// This sample demonstrates how to create an very simple Transform to use for submitting any custom Job into.
// Creating a very basic transform in this fashion allows you to treat the AMS v3 API more like the legacy v2 API where 
// transforms were not required, and you could submit any number of custom jobs to the same endpoint. 
// In the new v3 API, the default workflow is to create a transform "template" that holds a unique queue of jobs just for that
// specific "recipe" of custom or pre-defined encoding. 
//
// In this sample, we show you how to create the blank empty Transform, and then submit a couple unique custom jobs to it,
// overriding the blank empty Transform. 


import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    AssetContainerPermission,
    JobOutputAsset,
    JobInputUnion,
    JobsGetResponse,
    TransformOutput,
    KnownAacAudioProfile,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    KnownH264Complexity,
    PresetUnion,
    StandardEncoderPreset
} from '@azure/arm-mediaservices';
import { TransformFactory }  from "../../Common/Encoding/TransformFactory";
import { BlobServiceClient, AnonymousCredential } from "@azure/storage-blob";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';
// Load the .env file if it exists
import * as dotenv from "dotenv";
import { format } from "path";
dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const clientId: string = process.env.AADCLIENTID as string;
const secret: string = process.env.AADSECRET as string;
const tenantDomain: string = process.env.AADTENANTDOMAIN as string;
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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "emptyTransform";
let inputExtension: string;
let blobName: string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "EmptyTransform";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

    // Create a new Standard encoding Transform that is empty
    console.log(`Creating empty, blank, Standard Encoding transform named: ${transformName}`);

    // In this sample, we create the simplest of Transforms allowed by the API to later submit custom jobs against.
    // Even though we define a single layer H264 preset here, we are going to override it later with a custom job level preset.
    // This allows you to treat this single Transform queue like the legacy v2 API, which only supported a single Job queue type.
    // In v3 API, the typical workflow that you will see in other samples is to create a transform "recipe" and submit jobs to it
    // that are all of the same type of output. 
    // Some customers need the flexibility to submit custom Jobs. 

    // First we create an mostly empty TransformOutput with a very basic H264 preset that we override later.
    // If a Job were submitted to this base Transform, the output would be a single MP4 video track at 1 Mbps. 
    let transformOutput: TransformOutput[] = [{
        preset: TransformFactory.createStandardEncoderPreset({
            codecs: [
                TransformFactory.createH264Video({
                    layers:[
                        TransformFactory.createH264Layer({
                            bitrate: 1000000, // Units are in bits per second and not kbps or Mbps - 1 Mbps or 1,000 kbps
                    })]
                })
            ],
            formats: [
                TransformFactory.createMp4Format({
                    filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
                })
            ],
        }),
        // What should we do with the job if there is an error?
        onError: KnownOnErrorType.StopProcessingJob,
        // What is the relative priority of this job to others? Normal, high or low?
        relativePriority: KnownPriority.Normal
    }
    ];

    console.log("Creating empty transform...");

    let transform: Transform = {
        name: transformName,
        description: "An empty transform to be used for submitting custom jobs against",
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
    let input = await getJobInputType(uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Creating a new custom preset override and submitting the job to the empty transform ${transformName} job queue...`);

    // Create a new Preset Override to define a custom standard encoding preset
    let standardPreset_H264: StandardEncoderPreset = TransformFactory.createStandardEncoderPreset({
        codecs: [
            TransformFactory.createH264Video({
                // Next, add a H264Video for the video encoding
                keyFrameInterval: "PT2S", //ISO 8601 format supported
                complexity: KnownH264Complexity.Speed,
                layers: [
                    TransformFactory.createH264Layer({
                        bitrate: 3600000, // Units are in bits per second and not kbps or Mbps - 3.6 Mbps or 3,600 kbps
                        width: "1280",
                        height: "720",
                        label: "HD-3600kbps" // This label is used to modify the file name in the output formats
                    })
                ]
            }),
           TransformFactory.createAACaudio({
                // Add an AAC Audio layer for the audio encoding
                channels: 2,
                samplingRate: 48000,
                bitrate: 128000,
                profile: KnownAacAudioProfile.AacLc
            })
        ],
        formats: [
            TransformFactory.createMp4Format({
                filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
            })
        ]

    });

    // Submit the H264 encoding custom job, passing in the preset override defined above.
    let job = await submitJob(transformName, jobName, input, outputAssetName, standardPreset_H264);

    // Next, we will create another preset override that uses HEVC instead and submit it against the same simple transform
     // Create a new Preset Override to define a custom standard encoding preset
     let standardPreset_HEVC: StandardEncoderPreset = TransformFactory.createStandardEncoderPreset({
        codecs: [
            TransformFactory.createH265Video({
                // Next, add a H264Video for the video encoding
                keyFrameInterval: "PT2S", //ISO 8601 format supported
                complexity: KnownH264Complexity.Speed,
                layers: [
                    TransformFactory.createH265Layer({
                        bitrate: 1800000, // Units are in bits per second and not kbps or Mbps - 3.6 Mbps or 3,600 kbps
                        maxBitrate: 1800000,
                        width: "1280",
                        height: "720",
                        bFrames: 4,
                        label: "HD-1800kbps" // This label is used to modify the file name in the output formats
                    }),
                ]
            }),
            TransformFactory.createAACaudio({
                // Add an AAC Audio layer for the audio encoding
                channels: 2,
                samplingRate: 48000,
                bitrate: 128000,
                profile: KnownAacAudioProfile.AacLc
            })
        ],
        formats: [
            TransformFactory.createMp4Format({
                filenamePattern: "Video-{Basename}-{Label}-{Bitrate}{Extension}"
            })
        ]
    });

    // Lets update some names to re-use for the HEVC job we want to submit
    let jobNameHEVC = jobName + "_HEVC";
    let outputAssetNameHEVC = outputAssetName + "_HEVC";

    // Lets create a new output asset
    console.log("Creating a new output Asset (container) to encode the content into...");
    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetNameHEVC, {});

     // Submit the next HEVC custom job, passing in the preset override defined above.
    let job2 = await submitJob(transformName, jobNameHEVC, input, outputAssetNameHEVC, standardPreset_HEVC);


    console.log(`Waiting for encoding Jobs to finish...`);
    job = await waitForJobToFinish(transformName, jobName);
    job2 =await waitForJobToFinish(transformName, jobName);

    // Wait for the first H264 job to finish and then download the output
    if (job.state == "Finished") {
        await downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded H264 custom job to local folder. Please review the outputs from the encoding job.")
    }

    // check on the status of the second HEVC encoding job and then download the output
    if (job2.state == "Finished") {
        await downloadResults(outputAssetNameHEVC as string, outputFolder);
        console.log("Downloaded HEVC custom job to local folder.")
    }
}


main().catch((err) => {
    console.error("Error running sample:", err.message);
});


async function downloadResults(assetName: string, resultsFolder: string) {
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

async function waitForJobToFinish(transformName: string, jobName: string) {
    let timeout = new Date();
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

// Selects the JobInput type to use based on the value of inputFile or inputUrl. 
// Set inputFile to null to create a Job input that sources from an HTTP URL path
// Creates a new input Asset and uploads the local file to it before returning a JobInputAsset object
// Returns a JobInputHttp object if inputFile is set to null, and the inputUrl is set to a valid URL
async function getJobInputType(uniqueness: string): Promise<JobInputUnion> {
    if (inputFile !== undefined) {
        let assetName: string = namePrefix + "-input-" + uniqueness;
        await createInputAsset(assetName, inputFile);
        return TransformFactory.createJobInputAsset({
            assetName: assetName
        })
    } else {
        return TransformFactory.createJobInputHttp({
            files: [inputUrl]
        })
    }
}

// Creates a new Media Services Asset, which is a pointer to a storage container
// Uses the Storage Blob npm package to upload a local file into the container through the use 
// of the SAS URL obtained from the new Asset object.  
// This demonstrates how to upload local files up to the container without require additional storage credential.
async function createInputAsset(assetName: string, fileToUpload: string) {
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

        console.log(`working directory:${process.cwd()} `)
        let cwd: string = process.cwd();
        let filepath: string = path.join(cwd, fileToUpload)

        // Parallel uploading with BlockBlobClient.uploadFile() in Node.js runtime
        // BlockBlobClient.uploadFile() is only available in Node.js and not in Browser
        await blockBlobClient.uploadFile(filepath, {
            blockSize: 4 * 1024 * 1024, // 4MB Block size
            concurrency: 20, // 20 concurrent
            onProgress: (ev) => console.log(ev)
        });

    }

    return asset;
}


async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string, presetOverride: PresetUnion) {
    if (outputAssetName === undefined) {
        throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
    }

    if (presetOverride === undefined) {
        throw new Error("Preset override must be supplied in this sample.")
    }


    let jobOutputs: JobOutputAsset[] = [
        TransformFactory.createJobOutputAsset({
            assetName: outputAssetName,
            presetOverride: presetOverride
        })
    ];

    return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
        input: jobInput,
        outputs: jobOutputs
    });

}

