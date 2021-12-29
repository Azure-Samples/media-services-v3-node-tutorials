// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// This sample shows how to use the built-in Copy codec preset that can take a source video file that is already encoded
// using H264 and AAC audio, and copy it into MP4 tracks that are ready to be streamed by the AMS service.
// In addition, this preset generates a fast proxy MP4 from the source video. 
// This is very helpful for scenarios where you want to make the uploaded MP4 asset available quickly for streaming, but also generate
// a low quality proxy version of the asset for quick preview, video thumbnails, or low bitrate delivery while your application logic
// decides if you need to backfill any more additional layers (540P, 360P, etc) to make the full adaptive bitrate set complete. 
// This strategy is commonly used by services like YouTube to make content appear to be "instantly" available, but slowly fill in the 
// quality levels for a more complete adaptive streaming experience. See the Encoding_BuiltIn_CopyCodec sample for a version that does not
// generate the additional proxy layer. 
// 
// This is useful for scenarios where you have complete control over the source asset, and can encode it in a way that is 
// consistent with streaming (2-6 second GOP length, Constant Bitrate CBR encoding, no or limited B frames).
// This preset should be capable of converting a source 1 hour video into a streaming MP4 format in under 1 minute, as it is not
// doing any encoding - just re-packaging the content into MP4 files. 
//
// NOTE: If the input has any B frames encoded, we occasionally can get the GOP boundaries that are off by 1 tick
//       which can cause some issues with adaptive switching.
//       This preset works up to 4K and 60fps content.   

import { DefaultAzureCredential } from "@azure/identity";
import {
    AzureMediaServices,
    TransformOutput,
    KnownOnErrorType,
    KnownPriority,
    Transform,
    JobOutputAsset
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

// ----------- BEGIN SAMPLE SETTINGS -------------------------------

// You can either specify a local input file with the inputFile or an input Url with inputUrl. 
// Just set the other one to null to have it select the right JobInput class type

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "encode_copycodec_sprite_proxy";
const transformName = "CopyCodecWithSpriteAndProxyCustom";

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
    let transformOutput: TransformOutput[] = [
        {
            preset: factory.createBuiltInStandardEncoderPreset({
                presetName: "SaasSourceAligned360pOnly" // There are some undocumented magical presets in our toolbox that do fun stuff - this one is going to copy the codecs from the source and also generate a 360p proxy file.
                
                // Other magical presets to play around with, that might (or might not) work for your source video content...
                // "SaasCopyCodec" - this just copies the source video and audio into an MP4 ready for streaming.  The source has to be H264 and AAC with CBR encoding and no B frames typically. 
                // "SaasProxyCopyCodec" - this copies the source video and audio into an MP4 ready for streaming and generates a proxy file.   The source has to be H264 and AAC with CBR encoding and no B frames typically. 
                // "SaasSourceAligned360pOnly" - same as above, but generates a single 360P proxy layer that is aligned in GOP to the source file. Useful for "back filling" a proxy on a pre-encoded file uploaded.  
                // "SaasSourceAligned540pOnly"-  generates a single 540P proxy layer that is aligned in GOP to the source file. Useful for "back filling" a proxy on a pre-encoded file uploaded. 
                // "SaasSourceAligned540p" - generates an adaptive set of 540P and 360P that is aligned to the source file. used for "back filling" a pre-encoded or uploaded source file in an output asset for better streaming. 
                // "SaasSourceAligned360p" - generates an adaptive set of 360P and 180P that is aligned to the source file. used for "back filling" a pre-encoded or uploaded source file in an output asset for better streaming. 
            })
        },
        {
        // uses the Standard Encoder Preset to generate copy the source audio and video to an output track, and generate a proxy and a sprite
        preset: factory.createStandardEncoderPreset({
            codecs: [
                factory.createCopyVideo({  // this part of the sample is a custom copy codec - It will copy the source video track directly to the output MP4 file
                }),
                factory.createCopyAudio({ // this part of the sample is a custom copy codec - copies the audio track from the source to the output MP4 file
                }),
                factory.createJpgImage({
                    // Also generate a set of thumbnails in one Jpg file (thumbnail sprite)
                    start: "0%",
                    step: "5%",
                    range: "100%",
                    spriteColumn:10,  // Key is to set the column number here, and then set the width and height of the layer.
                    layers: [
                        factory.createJpgLayer({
                            width: "20%",
                            height: "20%",
                            quality:85
                        })
                    ]
                })
            ],
            // Specify the format for the output files - one for video+audio, and another for the thumbnails
            formats: [
                // Mux the H.264 video and AAC audio into MP4 files, using basename, label, bitrate and extension macros
                // Note that since you have multiple H264Layers defined above, you have to use a macro that produces unique names per H264Layer
                // Either {Label} or {Bitrate} should suffice
                factory.createMp4Format({
                    filenamePattern: "CopyCodec-{Basename}{Extension}"
                }),
                factory.createJpgFormat({
                    filenamePattern: "sprite-{Basename}-{Index}{Extension}"
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
    let input = await jobHelper.getJobInputType(inputFile, inputUrl, namePrefix, uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;
    let locatorName = `locator${uniqueness}`;

    console.log("Creating the output Asset (container) to encode the content into...");

    let outputAsset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    console.log(`Submitting the encoding job to the ${transformName} job queue...`);

    
    // Since the above transform generates two Transform outputs, we need to define two Job output assets to push that content into. 
    // In this case, we want both Transform outputs to go back into the same output asset container. 
    let jobOutputs: JobOutputAsset[] = [
        // First Job output
        factory.createJobOutputAsset({
            assetName: outputAssetName
        }),
        factory.createJobOutputAsset({
            assetName: outputAssetName
        })
    ];

    // Submit the job, passing in a custom correlation data object for tracking purposes. You can catch this data on the job output or in Event Grid Events. 
    let job = await jobHelper.submitJobMultiOutputs(transformName, jobName, input, jobOutputs, { myTenant: "myCustomTenantName", myId: "1234" });

    console.log(`Waiting for encoding Job - ${job.name} - to finish...`);
    job = await jobHelper.waitForJobToFinish(transformName, jobName);

    if (job.state == "Finished") {
        await jobHelper.downloadResults(outputAssetName as string, outputFolder);
        console.log("Downloaded results to local folder. Please review the outputs from the encoding job.")
    }

    // Publish the output asset for streaming via HLS or DASH
    if (outputAsset !== undefined) {
        let locator = await jobHelper.createStreamingLocator(outputAssetName, locatorName);
        if (locator.name !== undefined) {
            let urls = await jobHelper.getStreamingUrls(locator.name);
        } else throw new Error("Locator was not created or Locator.name is undefined");
    }

}


main().catch((err) => {

    console.error("Error running sample:", err.message);
    console.error(`Error code: ${err.code}`);

    if (err.name == 'RestError') {
        // REST API Error message
        console.error("Error request:\n\n", err.request);
    }

});
