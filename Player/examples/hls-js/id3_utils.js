
/**
 * @summary A set of Id3Utils utility functions.
 * @export
 */
export default class Id3Utils{

    static isID3Header(data, offset) {
        /*
           * http://id3.org/id3v2.3.0
           * [0]     = 'I'
           * [1]     = 'D'
           * [2]     = '3'
           * [3,4]   = {Version}
           * [5]     = {Flags}
           * [6-9]   = {ID3 Size}
           *
           * An ID3v2 tag can be detected with the following pattern:
           *  $49 44 33 yy yy xx zz zz zz zz
           * Where yy is less than $FF, xx is the 'flags' byte and zz is less than $80
           */
        if (offset + 10 <= data.length) {
            // look for 'ID3' identifier
            if (
                data[offset] === 0x49 &&
                data[offset + 1] === 0x44 &&
                data[offset + 2] === 0x33
            ) {
                // check version is within range
                if (data[offset + 3] < 0xff && data[offset + 4] < 0xff) {
                    // check size is within range
                    if (
                        data[offset + 6] < 0x80 &&
                        data[offset + 7] < 0x80 &&
                        data[offset + 8] < 0x80 &&
                        data[offset + 9] < 0x80
                    ) {
                        return true;
                    }
                }
            }
        }

        return false;
    }


    static getID3Frames(id3Data, offset) {
        const frames = [];

        while (Id3Utils.isID3Header(id3Data, offset)) {
            console.log('Found ID3 Header');
            const size = Id3Utils.readSize(id3Data, offset + 6);

            if ((id3Data[offset + 5] >> 6) & 1) {
                // skip extended header
                offset += 10;
            }
            // skip past ID3 header
            offset += 10;

            const end = offset + size;
            //loop through the frames of the ID3 payload

            while (offset + 10 < end) {
                const frameData = Id3Utils.getFrameData(id3Data.subarray(offset));

                console.log("Found ID3 Frame type: " + frameData.type);
                const frame = Id3Utils.decodeFrame(frameData);

                if (frame) {
                    frames.push(frame);
                }

                // skip the frame header and frame data
                offset += frameData.size + 10;
            }
            return frames;
        }
    }

    static readSize(data, offset) {
        let size = 0;
        size = (data[offset] & 0x7f) << 21;
        size |= (data[offset + 1] & 0x7f) << 14;
        size |= (data[offset + 2] & 0x7f) << 7;
        size |= data[offset + 3] & 0x7f;
        return size;
    }

    static getFrameData(data) {
        /*
             * Frame ID       $xx xx xx xx (four characters)
             * Size           $xx xx xx xx
             * Flags          $xx xx
             */
        const type = String.fromCharCode(data[0], data[1], data[2], data[3]);
        //const dataView = new DataView(data.buffer, 4);
        const size = Id3Utils.readFrameSize(data, 4);

        // skip frame id, size, and flags
        const offset = 10;

        return {
            type,
            size,
            data: data.subarray(offset, offset + size),
        };
    }

    static readFrameSize(data, offset) {
        let size = 0;
        size = (data[offset]) << 24;
        size |= (data[offset + 1]) << 16;
        size |= (data[offset + 2]) << 8;
        size |= data[offset + 3];
        return size;
    };

    static decodeFrame(frame) {

        const metadataFrame = {
            key: frame.type,
            textEncoding: 0x03,
            mimeType: 'application/json',
            fileName: '',
            description: '',
            data: '',
        };

        if (frame.type == 'GEOB') {
            /*
             * Format:
             * Text encoding           $xx
             * MIME type               <text string> $00
             * Filename                <text string according to encoding> $00 (00)
             * Content description     $00 (00)
             * Encapsulated object     <binary data>
             */

            if (frame.size < 2) {
                console.log('GEOB object too small');
                return null;
            }

            if (
                frame.data[0] !== 0x03 &&
                frame.data[0] != 0
            ) {
                console.log.warning(
                    'Ignore frame with unrecognized character ' + 'encoding'
                );
                return null;
            }

            const mimeTypeEndIndex = frame.data.subarray(1).indexOf(0);
            if (mimeTypeEndIndex === -1) {
                return null;
            }

            // Breaking here...
            const mimeType = Id3Utils.utf8ArrayToStr(frame.data.subarray(1, mimeTypeEndIndex + 1));
            const data = Id3Utils.utf8ArrayToStr(frame.data.subarray(4 + mimeTypeEndIndex))

            metadataFrame.mimeType = mimeType;
            console.log('GEOB mimeType: ', metadataFrame.mimeType);
            metadataFrame.data = data;
            return metadataFrame;
        } else if (frame.data) {
            console.log('Unrecognized ID3 frame type:', frame.type);
            metadataFrame.data = BufferUtils.toArrayBuffer(frame.data);
            return metadataFrame;
        }

        return null;
    }


    // http://stackoverflow.com/questions/8936984/uint8array-to-string-in-javascript/22373197
    // http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt
    /* utf.js - UTF-8 <=> UTF-16 conversion
     *
     * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
     * Version: 1.0
     * LastModified: Dec 25 1999
     * This library is free.  You can redistribute it and/or modify it.
     */
    static utf8ArrayToStr(
        array
    ) {

        const decoder = new TextDecoder('utf-8');
        if (decoder) {
            const decoded = decoder.decode(array);
            // remove any null characters
            return decoded.replace(/\0/g, '');
        }
    };

};