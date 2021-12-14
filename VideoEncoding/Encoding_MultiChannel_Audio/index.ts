// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

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
    TrackDescriptorUnion,
    KnownChannelMapping,
    InputDefinitionUnion,
    JobInputAsset
} from '@azure/arm-mediaservices';
import * as factory from "../../Common/Encoding/TransformFactory";
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

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFilePath: string = "Media\\surround-audio.mp4"; // provide a sample file with 8 discrete audio tracks as layout is defined above. Path is relative to the working directory for Node.js
let inputFileName: string = "surround-audio.mp4"
// This is a hosted sample file to use
let inputUrl: string;

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encodeH264_multi_channel";
let inputExtension: string;
let blobName: string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    // These are the names used for creating and finding your transforms
    const transformName = "Custom_AAC_MultiChannel_Surround";

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId);

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
    let input = await getJobInputType(uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    // NOTE!: This call has been modified from previous samples in this repository to now take the list of InputDefinitions instead of just the filename.
    // This passes in the IncludedTracks list to map during the Transform. 
    let job = await submitJob(transformName, jobName, input, outputAssetName, inputDefinitions);

    console.log(`Waiting for encoding Job - ${job.name} - to finish...`);
    job = await waitForJobToFinish(transformName, jobName);

    if (job.state == "Finished") {
        await downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded results to local folder. Please review the outputs from the encoding job.")
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
    if (inputFilePath !== undefined) {
        let assetName: string = namePrefix + "-input-" + uniqueness;
        await createInputAsset(assetName, inputFilePath);
        return factory.createJobInputAsset({
            assetName: assetName
        })
    } else {
        return factory.createJobInputHttp({
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


async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string, inputDefinitions: InputDefinitionUnion[]) {
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

