//TODO:
// CREATE a Transform Factory class that simplifies the way that we create Codecs, layers, etc in the encoding workflows for Typescript
// Goal is to eliminate the need to always declare Odata types in the code. 
// 
// 
import {
    AacAudio,
    H264Layer,
    H264Video,
    Mp4Format,
    PngFormat,
    PngImage,
    PngLayer,
    StandardEncoderPreset
} from "@azure/arm-mediaservices"

export function createH264Video(h264Video: Omit<H264Video, "odataType">): H264Video {
    return {
        odataType: "#Microsoft.Media.H264Video",
        ...h264Video,
    }
}

export function createH264Layer(h264layer: Omit<H264Layer, "odataType">): H264Layer {
    return {
        odataType: "#Microsoft.Media.H264Layer",
        ...h264layer,
    }
}

export function createAACaudio(audio: Omit<AacAudio, "odataType">): AacAudio {
    return {
        odataType: "#Microsoft.Media.AacAudio",
        ...audio,
    }
}

export function createPngImage(image: Omit<PngImage, "odataType">): PngImage {
    return {
        odataType: "#Microsoft.Media.PngImage",
        ...image,
    }
}

export function createPngLayer(image: Omit<PngLayer, "odataType">): PngLayer {
    return {
        odataType: "#Microsoft.Media.PngLayer",
        ...image,
    }
}

export function createStandardEncoderPreset(standardEncoder: Omit<StandardEncoderPreset, "odataType">): StandardEncoderPreset {
    return {
        odataType: "#Microsoft.Media.StandardEncoderPreset",
        ...standardEncoder,
    }
}

export function createMp4Format(mp4Format: Omit<Mp4Format, "odataType">): Mp4Format {
    return {
        odataType: "#Microsoft.Media.Mp4Format",
        ...mp4Format,
    }
}

export function createPngFormat(pngFormat: Omit<PngFormat, "odataType">): PngFormat {
    return {
        odataType: "#Microsoft.Media.PngFormat",
        ...pngFormat,
    }
}

// Create a video object
const video = createH264Video({ label: "foo", sceneChangeDetection: false });

// instead of
const rawVideo: H264Video = { odataType: "#Microsoft.Media.H264Video", label: "foo", sceneChangeDetection: false };