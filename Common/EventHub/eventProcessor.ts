import { ReceivedEventData } from "@azure/event-hubs";

// Import all of the Media Services Event Grid Schema types from the most current @azure/eventgrid npm module. 
import {
    MediaJobCanceledEventData,
    MediaJobCancelingEventData,
    MediaJobError,
    MediaJobErrorCategory,
    MediaJobErrorCode,
    MediaJobErrorDetail,
    MediaJobErroredEventData,
    MediaJobFinishedEventData,
    MediaJobOutput,
    MediaJobOutputAsset,
    MediaJobOutputCanceledEventData,
    MediaJobOutputCancelingEventData,
    MediaJobOutputErroredEventData,
    MediaJobOutputFinishedEventData,
    MediaJobOutputProcessingEventData,
    MediaJobOutputProgressEventData,
    MediaJobOutputScheduledEventData,
    MediaJobOutputStateChangeEventData,
    MediaJobOutputUnion,
    MediaJobProcessingEventData,
    MediaJobRetry,
    MediaJobScheduledEventData,
    MediaJobState,
    MediaJobStateChangeEventData,
    MediaLiveEventChannelArchiveHeartbeatEventData,
    MediaLiveEventConnectionRejectedEventData,
    MediaLiveEventEncoderConnectedEventData,
    MediaLiveEventEncoderDisconnectedEventData,
    MediaLiveEventIncomingDataChunkDroppedEventData,
    MediaLiveEventIncomingStreamReceivedEventData,
    MediaLiveEventIncomingStreamsOutOfSyncEventData,
    MediaLiveEventIncomingVideoStreamsOutOfSyncEventData,
    MediaLiveEventIngestHeartbeatEventData,
    MediaLiveEventTrackDiscontinuityDetectedEventData
} from "@azure/eventgrid";

export class EventProcessor {

    private subjectName: string;

    constructor(subjectName: string) {
        this.subjectName = subjectName;
    }

    public processEvents(events: ReceivedEventData[]) {
        {
            for (const event of events) {

                // Log the JSON full JSON message body - uncomment the following line if you want to see the full body of the event message
                // console.log(JSON.stringify(event.body[0]));

                event.body.forEach((e: {
                    subject: string;
                    topic: string;
                    eventType: string;
                    eventTime: Date;
                    data:
                    MediaJobCanceledEventData |
                    MediaJobCancelingEventData |
                    MediaJobErroredEventData |
                    MediaJobFinishedEventData |
                    MediaJobOutputCanceledEventData |
                    MediaJobOutputCancelingEventData |
                    MediaJobOutputErroredEventData |
                    MediaJobOutputFinishedEventData |
                    MediaJobOutputProcessingEventData |
                    MediaJobOutputProgressEventData |
                    MediaJobOutputScheduledEventData |
                    MediaJobOutputStateChangeEventData |
                    MediaJobProcessingEventData |
                    MediaJobScheduledEventData |
                    MediaJobStateChangeEventData |
                    MediaLiveEventChannelArchiveHeartbeatEventData |
                    MediaLiveEventConnectionRejectedEventData |
                    MediaLiveEventEncoderConnectedEventData |
                    MediaLiveEventEncoderDisconnectedEventData |
                    MediaLiveEventIncomingDataChunkDroppedEventData |
                    MediaLiveEventIncomingStreamReceivedEventData |
                    MediaLiveEventIncomingStreamsOutOfSyncEventData |
                    MediaLiveEventIncomingVideoStreamsOutOfSyncEventData |
                    MediaLiveEventIngestHeartbeatEventData |
                    MediaLiveEventTrackDiscontinuityDetectedEventData
                }) => {

                    let subject = e.subject;
                    // let topic = e.topic;
                    let eventType = e.eventType;
                    let eventTime = e.eventTime;

                    if (subject.indexOf(this.subjectName) < 0)
                        return;

                    // Log the time and type of event
                    console.log(
                        `${eventTime} - Received event: '${eventType}' for subject : ${subject} `
                        
                    );
                    
                
                    switch (eventType) {

                        // Job state change events
                        case "Microsoft.Media.JobStateChange":
                        case "Microsoft.Media.JobScheduled":
                        case "Microsoft.Media.JobProcessing":
                        case "Microsoft.Media.JobCanceling":
                        case "Microsoft.Media.JobFinished":
                        case "Microsoft.Media.JobCanceled":
                        case "Microsoft.Media.JobErrored":
                            {
                                let jobData = e.data as MediaJobStateChangeEventData;

                                console.log(`Job state changed for JobId: ${subject} PreviousState: ${jobData.previousState} State: ${jobData.state}`);
                                // If you want to track the correlation data on the Job, which may have tenant or customer based information in it that you passed in with the Job on Submit
                                // You can check for your custom correlation data object here and log it. 
                                if (jobData.correlationData) {
                                    console.log(`Job event correlation data:  ${JSON.stringify(jobData.correlationData)}`)
                                }

                            }
                            break;

                        // Job output state change events
                        case "Microsoft.Media.JobOutputProgress":
                            {
                                let jobOutputProgress = e.data as MediaJobOutputProgressEventData;

                                console.log(`Job Output labeled: ${jobOutputProgress.label} reached Progress: ${jobOutputProgress.progress}%`);

                                // If you want to track the correlation data on the Job, which may have tenant or customer based information in it that you passed in with the Job on Submit
                                // You can check for your custom correlation data object here and log it. 
                                if (jobOutputProgress.jobCorrelationData) {
                                    console.log(`Job event correlation data: ${JSON.stringify(jobOutputProgress.jobCorrelationData)}`)
                                }
                            }
                            break;

                        case "Microsoft.Media.JobOutputStateChange":
                        case "Microsoft.Media.JobOutputScheduled":
                        case "Microsoft.Media.JobOutputProcessing":
                        case "Microsoft.Media.JobOutputCanceling":
                        case "Microsoft.Media.JobOutputFinished":
                        case "Microsoft.Media.JobOutputCanceled":
                            {
                                let jobOutputState = e.data as MediaJobOutputStateChangeEventData;

                                console.log(`Job output state changed for JobId: ${subject} PreviousState: ${jobOutputState.previousState}` +
                                    `State: ${jobOutputState.output.state} Progress: ${jobOutputState.output.progress}%`);
                            }
                            break;

                        case "Microsoft.Media.JobOutputErrored":
                            {
                                let jobOutputError = e.data as MediaJobOutputErroredEventData;
                                console.error(`ERROR: Job output on JobId: ${subject} has error message : ${jobOutputError.output.error}`);

                            }
                            break;

                        // LiveEvent Stream-level events
                        // See the following documentation for updated schemas  - https://docs.microsoft.com/azure/media-services/latest/monitoring/media-services-event-schemas#live-event-types
                        case "Microsoft.Media.LiveEventConnectionRejected":
                            {
                                let liveEventData = e.data as MediaLiveEventConnectionRejectedEventData;

                                console.error(`ERROR: LiveEvent connection rejected. IngestUrl: ${liveEventData.ingestUrl} StreamId: ${liveEventData.streamId} ` +
                                    `EncoderIp: ${liveEventData.encoderIp} EncoderPort: ${liveEventData.encoderPort}`);

                                console.error(`ERROR: LiveEvent rejected resultCode ${liveEventData.resultCode}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventEncoderConnected":
                            {
                                let liveEventData = e.data as MediaLiveEventEncoderConnectedEventData
                                console.log(`LiveEvent encoder connected. IngestUrl: ${liveEventData.ingestUrl} StreamId: ${liveEventData.streamId} ` +
                                    `EncoderIp: ${liveEventData.encoderIp} EncoderPort: ${liveEventData.encoderPort}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventEncoderDisconnected":
                            {
                                let liveEventData = e.data as MediaLiveEventEncoderDisconnectedEventData;
                                console.warn(`LiveEvent encoder disconnected. IngestUrl: ${liveEventData.ingestUrl} StreamId: ${liveEventData.streamId} ` +
                                    `EncoderIp: ${liveEventData.encoderIp} EncoderPort: ${liveEventData.encoderPort}`);

                                console.warn(`WARN: LiveEvent disconnected resultCode: ${liveEventData.resultCode}`);
                            }
                            break;

                        // LiveEvent Track-level events
                        // See the following documentation for updated schemas - https://docs.microsoft.com/azure/media-services/latest/monitoring/media-services-event-schemas#live-event-types
                        case "Microsoft.Media.LiveEventIncomingDataChunkDropped":
                            {
                                let liveEventData = e.data as MediaLiveEventIncomingDataChunkDroppedEventData;
                                console.log(`LiveEvent data chunk dropped. LiveEventId: ${this.subjectName} ResultCode: ${liveEventData.resultCode}`);
                                console.log(`   trackName: ${liveEventData.trackName}`);
                                console.log(`   trackType: ${liveEventData.trackType}`);
                                console.log(`   timeStamp: ${liveEventData.timestamp}`);
                                console.log(`   timeScale: ${liveEventData.timescale}`);
                                console.log(`   bitrate: ${liveEventData.bitrate}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventIncomingStreamReceived":
                            {
                                let liveEventData = e.data as MediaLiveEventIncomingStreamReceivedEventData;
                                console.log(`LiveEvent incoming stream received. IngestUrl: ${liveEventData.ingestUrl} EncoderIp: ${liveEventData.encoderIp} ` +
                                    `EncoderPort: ${liveEventData.encoderPort}`);
                                console.log(`   trackName: ${liveEventData.trackName}`);
                                console.log(`   trackType: ${liveEventData.trackType}`);
                                console.log(`   timeStamp: ${liveEventData.timestamp}`);
                                console.log(`   timeScale: ${liveEventData.timescale}`);
                                console.log(`   bitrate: ${liveEventData.bitrate}`);
                                console.log(`   duration: ${liveEventData.duration}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventIncomingStreamsOutOfSync":
                            {
                                let liveEventData = e.data as MediaLiveEventIncomingStreamsOutOfSyncEventData;
                                console.log(`LiveEvent incoming audio and video streams are out of sync. LiveEventId: ${this.subjectName}`);
                                console.log(`    maxLastTimestamp: ${liveEventData.maxLastTimestamp}`);
                                console.log(`    timescaleOfMaxLastTimestamp: ${liveEventData.timescaleOfMaxLastTimestamp}`);
                                console.log(`    typeOfStreamWithMaxLastTimestamp: ${liveEventData.typeOfStreamWithMaxLastTimestamp}`);
                                console.log(`    minLastTimeStamp: ${liveEventData.minLastTimestamp}`);
                                console.log(`    timescaleOfMinLastTimestamp: ${liveEventData.timescaleOfMinLastTimestamp}`);
                                console.log(`    typeOfStreamWithMinLastTimestamp: ${liveEventData.typeOfStreamWithMinLastTimestamp}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventIncomingVideoStreamsOutOfSync":
                            {
                                let liveEventData = e.data as MediaLiveEventIncomingVideoStreamsOutOfSyncEventData;
                                console.log(`Live Event incoming video streams are out of sync. LiveEventId: ${this.subjectName}`);
                                console.log(`   firstDuration: ${liveEventData.firstDuration}`);
                                console.log(`   firstTimestamp: ${liveEventData.firstTimestamp}`);
                                console.log(`   secondDuration: ${liveEventData.secondDuration}`);
                                console.log(`   secondTimestamp: ${liveEventData.secondTimestamp}`);
                                console.log(`   timescale: ${liveEventData.timescale}`);
                            }
                            break;
                        case "Microsoft.Media.LiveEventIngestHeartbeat":
                            {
                                let liveEventData = e.data as MediaLiveEventIngestHeartbeatEventData;
                                console.log(`LiveEvent ingest heart beat. TrackType: ${liveEventData.trackType} State: ${liveEventData.state} isHealthy: ${liveEventData.healthy}`);
                                console.log(`      ingestDriftValue: ${liveEventData.ingestDriftValue}`);
                                console.log(`      bitrate: ${liveEventData.bitrate}`);
                                console.log(`      discontinuityCount: ${liveEventData.discontinuityCount}`);
                                console.log(`      healthy: ${liveEventData.healthy}`);
                                console.log(`      incomingBitrate: ${liveEventData.incomingBitrate}`);
                                console.log(`      lastFragmentArrivalTime: ${liveEventData.lastFragmentArrivalTime}`);
                                console.log(`      lastTimestamp: ${liveEventData.lastTimestamp}`);
                                console.log(`      nonincreasingCount: ${liveEventData.nonincreasingCount}`);
                                console.log(`      overlapCount: ${liveEventData.overlapCount}`);
                                console.log(`      state: ${liveEventData.state}`);
                                console.log(`      timescale: ${liveEventData.timescale}`);
                                console.log(`      trackName: ${liveEventData.trackName}`);
                                console.log(`      trackType: ${liveEventData.trackType}`);
                                console.log(`      transcriptionLanguage: ${liveEventData.transcriptionLanguage}`);
                                console.log(`      transcriptionState: ${liveEventData.transcriptionState}`);
                                console.log(`      unexpectedBitrate: ${liveEventData.unexpectedBitrate}`);

                            }
                            break;
                        case "Microsoft.Media.LiveEventTrackDiscontinuityDetected":
                            {
                                let liveEventData = e.data as MediaLiveEventTrackDiscontinuityDetectedEventData;
                                console.log(`LiveEvent discontinuity in the incoming track detected. LiveEventId: ${this.subjectName} TrackType: ${liveEventData.trackType} `);
                                console.log(`   discontinuityGap: ${liveEventData.discontinuityGap}`);
                                console.log(`   bitrate: ${liveEventData.bitrate}`);
                                console.log(`   newTimestamp: ${liveEventData.newTimestamp}`);
                                console.log(`   previousTimestamp: ${liveEventData.previousTimestamp}`);
                                console.log(`   timescale: ${liveEventData.timescale}`);
                                console.log(`   trackName: ${liveEventData.trackName}`);
                                console.log(`   trackType: ${liveEventData.trackType}`);
                            }
                            break;
                        case "LiveEventChannelArchiveHeartbeatEvent":
                            {
                                let liveEventData = e.data as MediaLiveEventChannelArchiveHeartbeatEventData;
                                console.log(`LiveEvent archive heartbeat event detected. LiveEventId: ${this.subjectName}`);
                                console.log(`   channelLatencyMs: ${liveEventData.channelLatencyMs}`);
                                console.log(`   latencyResultCode: ${liveEventData.latencyResultCode}`);

                            }
                            break;
                    }

  
                });

            }



        }
    }

}