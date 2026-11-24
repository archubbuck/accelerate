import type {JobQueue} from "@accelerate/jobs-core";
export interface Schedule<T=unknown>{id:string;name:string;payload:T;intervalMs:number;startAt:number;}
export class Scheduler {
 private readonly schedules=new Map<string,{schedule:Schedule;next:number}>();
 private running=false;
 constructor(private readonly queue:JobQueue,private readonly now:()=>number=Date.now){}
 register<T>(schedule:Schedule<T>):()=>void{if(!schedule.id||!schedule.name||!Number.isSafeInteger(schedule.intervalMs)||schedule.intervalMs<=0||!Number.isSafeInteger(schedule.startAt)||this.schedules.has(schedule.id))throw new Error("Invalid or duplicate schedule");const entry={schedule:{...schedule},next:schedule.startAt};this.schedules.set(schedule.id,entry);return ()=>{if(this.schedules.get(schedule.id)===entry)this.schedules.delete(schedule.id);};}
 async tick():Promise<number>{if(this.running)throw new Error("Tick already running");this.running=true;let count=0;try{const now=this.now();for(const entry of this.schedules.values()){if(entry.next>now)continue;const {schedule}=entry;const slot=entry.next+Math.floor((now-entry.next)/schedule.intervalMs)*schedule.intervalMs;await this.queue.enqueue(schedule.name,schedule.payload,{id:schedule.id+":"+slot});entry.next=slot+schedule.intervalMs;count++;}return count;}finally{this.running=false;}}
}
