import { ReceivedEventData } from "@azure/event-hubs";

export class EventProcessor {

    private subjectName: string;

    constructor(subjectName:string) {
        this.subjectName = subjectName;
    }

    public processEvents(events: ReceivedEventData[]){
        {
            // Note: It is possible for `events` to be an empty array.
            // This can happen if there were no new events to receive
            // in the `maxWaitTimeInSeconds`, which is defaulted to
            // 60 seconds.
            // The `maxWaitTimeInSeconds` can be changed by setting
            // it in the `options` passed to `subscribe()`.
            for (const event of events) {
                if (event.body[0] !== undefined) {

                    if (event.body[0].subject.indexOf(this.subjectName) <0 )
                        return;

                    console.log(
                        `Received event: '${event.body[0].eventType}' for subject : ${this.subjectName} `
                    );
                    // Log the JSON full JSON message body - uncomment the following line if you want to see the full body of the event message
                    // console.log(JSON.stringify(event.body[0]));

                    // TODO : Need to add code here to filter out the events by subject and type
                    //        Right now this will get ALL events from the account, which could be ALL the things happening. 
                }
            }
        }
    }

}