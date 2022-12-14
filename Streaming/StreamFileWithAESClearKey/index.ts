// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential} from "@azure/identity";
import {
    AzureMediaServices,
    Transform,
    KnownEncoderNamedPreset,
    Asset,
    KnownAssetContainerPermission,
    KnownJobState,
    StreamingEndpoint,
    StreamingLocator,
    KnownStreamingEndpointResourceState,
    ContentKeyPolicyClearKeyConfiguration,
    ContentKeyPolicyTokenRestriction,
    ContentKeyPolicySymmetricTokenKey,
    ContentKeyPolicy,
    KnownContentKeyPolicyRestrictionTokenType,
    
} from '@azure/arm-mediaservices';
import {
    BlobServiceClient,
    AnonymousCredential,
    BlockBlobClient
} from "@azure/storage-blob";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as util from 'util';
// Load the .env file if it exists
import * as dotenv from "dotenv";
import * as path from "path";
import * as url from 'whatwg-url';
import * as factory from "../../Common/Encoding/transformFactory";

dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

const subscriptionId: string = process.env.AZURE_SUBSCRIPTION_ID as string; // this should be in the format 00000000-0000-0000-0000-000000000000
const resourceGroup: string = process.env.AZURE_RESOURCE_GROUP as string;
const accountName: string = process.env.AZURE_MEDIA_SERVICES_ACCOUNT_NAME as string;

// This sample uses the default Azure Credential object, which relies on the environment variable settings.
// If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
// Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
// https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
// See the following examples for how to authenticate in Azure with managed identity
// https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 
// If you have issues with using the Visual Studio Azure identity, see  https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/TROUBLESHOOTING.md#troubleshoot-default-azure-credential-authentication-issues 

const credential = new DefaultAzureCredential();

// "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string = "Media\\ignite.mp4";
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "streamClearKey";
let inputExtension: string;
let blobName: string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {

    let runIndex = new Date().getTime().toString();

    mediaServicesClient = new AzureMediaServices(credential, subscriptionId, {});

    let mediaServiceAccount = await mediaServicesClient.mediaservices.get(resourceGroup, accountName);

    console.log(`Using media service account ID :  ${mediaServiceAccount.mediaServiceId}`);

    let transform = await CreateTransformAsync(mediaServicesClient);

    if (transform && transform.name) {
        let outputAsset = await EncodeFileAsync(mediaServicesClient, transform.name, inputFile, runIndex);

        let streamingEndpoint = await StartStreamingEndpointAsync(mediaServicesClient);

        let password = "mango apple bananas"; // update this to any value you like
        let contentKeyPolicy = await CreateContentKeyPolicyAsync(mediaServicesClient, password, runIndex);
        let streamingLocator = await CreateStreamingLocatorAsync(mediaServicesClient, outputAsset,contentKeyPolicy, runIndex);

        console.log();

        let streamingUri = `https://${streamingEndpoint.hostName}/${streamingLocator.streamingLocatorId}/${path.basename(inputFile).split('.')[0]}.ism/manifest`;

        console.log(`Steaming URL: ${streamingUri}`);
        console.log();
        let playbackToken = CreateToken(password);
        console.log(`Watch your video at: https://aka.ms/azuremediaplayer?url=${encodeURI(streamingUri)}&aes=true&aestoken=${playbackToken}`);

        console.log(`Playback token: ${playbackToken}`);

    }

}


async function CreateTransformAsync(mediaServices: AzureMediaServices): Promise<Transform> {
    console.log("Creating transform");
    var transformName = "content-aware-transform";

    try {
        let transform = await mediaServices.transforms.get(resourceGroup, accountName, transformName);
        return transform;

    } catch (err) {
        console.log(`Transform ${transformName} does not exist.`);

        // Create a new Transform using a preset name from the list of built in encoding presets. 
        // To use a custom encoding preset, you can change this to be a StandardEncoderPreset, which has support for codecs, formats, and filter definitions.
        // This sample uses the 'ContentAwareEncoding' preset which chooses the best output based on an analysis of the input video.
        let transform = await mediaServices.transforms.createOrUpdate(resourceGroup, accountName, transformName,
            {
                name: transformName,
                outputs: [{
                    preset: factory.createBuiltInStandardEncoderPreset({
                        presetName: KnownEncoderNamedPreset.ContentAwareEncoding,
                    })
                }]
            });
        return transform;

    }


}

// Helper function to add an hour to the current time for use with the blob client uploader
function addHours(numOfHours: number, date = new Date()): Date {
    date.setTime(date.getTime() + numOfHours * 60 * 60 * 1000);

    return date;
}

async function EncodeFileAsync(
    mediaServices: AzureMediaServices,
    transformName: string,
    inputFilePath: string,
    runIndex: string): Promise<Asset> {
    console.log("Creating input asset");

    let inputAssetName = `input-asset-${runIndex}`;

    let inputAsset = await mediaServices.assets.createOrUpdate(
        resourceGroup,
        accountName,
        inputAssetName,
        {}
    );

    let listContainerSas = await mediaServices.assets.listContainerSas(resourceGroup,
        accountName,
        inputAssetName,
        {
            expiryTime: addHours(1),
            permissions: KnownAssetContainerPermission.ReadWriteDelete
        })

    if (listContainerSas.assetContainerSasUrls) {
        console.log("Uploading input asset media");
        let uploadSasUrl = listContainerSas.assetContainerSasUrls[0];
        let fileName = path.basename(inputFilePath);

        let inputAssetContainer = new BlobServiceClient(uploadSasUrl, new AnonymousCredential()).getContainerClient('');
        let inputAssetBlob = inputAssetContainer.getBlockBlobClient(fileName);
        await inputAssetBlob.uploadFile(inputFilePath,
            {
                blockSize: 4 * 1024 * 1024, // 4MB Block size
                concurrency: 20, // 20 concurrent
                onProgress: (ev) => console.log(ev)
            }
        );
    }

    console.log("Creating output asset");
    let outputAssetName = `output-asset-${runIndex}`;

    let outputAsset = await mediaServices.assets.createOrUpdate(
        resourceGroup,
        accountName,
        outputAssetName,
        {});

    console.log("Starting encoding job");
    let jobName = `job-${runIndex}`;
    var job = await mediaServices.jobs.create(
        resourceGroup,
        accountName,
        transformName,
        jobName,
        {
            input: factory.createJobInputAsset({
                assetName: inputAssetName
            }),
            outputs: [factory.createJobOutputAsset({
                assetName: outputAssetName,
            })]
        }
    );


    while (
        job.state == KnownJobState.Processing ||
        job.state == KnownJobState.Queued ||
        job.state == KnownJobState.Scheduled) {

        if (job.outputs) {
            console.log(`Waiting for job to complete... ${job.state}, ${job.outputs[0].progress}% complete`);
        }

        await sleep(10000);
        job = await mediaServicesClient.jobs.get(resourceGroup, accountName, transformName, jobName);
    }

    console.log(`Final job state ${job.state}`);
    return outputAsset;
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


async function StartStreamingEndpointAsync(
    mediaServices: AzureMediaServices): Promise<StreamingEndpoint> {
    let defaultStreamingEndpoint: StreamingEndpoint =
        await mediaServices.streamingEndpoints.get(resourceGroup, accountName, "default");

    if (defaultStreamingEndpoint.resourceState != KnownStreamingEndpointResourceState.Running) {
        console.log("Starting default streaming endpoint");
        await mediaServicesClient.streamingEndpoints.beginStartAndWait(resourceGroup, accountName, "default", { updateIntervalInMs: 10000 })
    }

    return defaultStreamingEndpoint;
}

async function CreateStreamingLocatorAsync(
    mediaServices: AzureMediaServices,
    outputAsset: Asset,
    contentKeyPolicy:ContentKeyPolicy,
    runIndex: string): Promise<StreamingLocator> {
    console.log("Creating streaming locator");

    return await mediaServices.streamingLocators.create(
        resourceGroup,
        accountName,
        `locator-${runIndex}`,
        {
            assetName: outputAsset.name,
            streamingPolicyName: "Predefined_ClearKey",
            defaultContentKeyPolicyName: contentKeyPolicy.name
        });
}

async function CreateContentKeyPolicyAsync(
    mediaServices: AzureMediaServices,
    password: string,
    runIndex: string): Promise<ContentKeyPolicy> {

    console.log("Creating content key policy");

    let configuration: ContentKeyPolicyClearKeyConfiguration = {
        odataType: "#Microsoft.Media.ContentKeyPolicyClearKeyConfiguration",
    }

    let primaryKey: ContentKeyPolicySymmetricTokenKey = {
        odataType: "#Microsoft.Media.ContentKeyPolicySymmetricTokenKey",
        keyValue: DeriveKey(password),
    }

    let restriction: ContentKeyPolicyTokenRestriction= {
        odataType: "#Microsoft.Media.ContentKeyPolicyTokenRestriction",
        issuer: "urn:microsoft:azure:mediaservices",
        audience: "urn:microsoft:azure:mediaservices",
        primaryVerificationKey: primaryKey,
        restrictionTokenType: KnownContentKeyPolicyRestrictionTokenType.Jwt
    }

    return (await mediaServices.contentKeyPolicies.createOrUpdate(
        resourceGroup,
        accountName,
        `ckp-${runIndex}`,
        {
            options: [
                {
                    configuration: configuration,
                    restriction:restriction,
                    name: "option1"
                }
            ]
        }));

}

function DeriveKey(password: string) {
    let hash = crypto.createHash('sha256');
    hash.update(new TextEncoder().encode(password));

    return hash.digest().subarray(0,16)
}

function CreateToken(password:string) :string
{
    var tokenKey = DeriveKey(password)
    
    let jwtToken = jwt.sign(
        {},
        Buffer.from(tokenKey),
        {
            algorithm: "HS256",
            issuer: "urn:microsoft:azure:mediaservices",
            audience: "urn:microsoft:azure:mediaservices",
            expiresIn: "4h",

        }
    );

    return jwtToken;
}

main().catch((err) => {

    console.error("Error running sample:", err.message);
    console.error(`Error code: ${err.code}`);

    if (err.name == 'RestError') {
        // REST API Error message
        console.error("Error request:\n\n", err.request);
    }

});