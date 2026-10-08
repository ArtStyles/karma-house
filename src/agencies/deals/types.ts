import type { AgencyRequestContext, DealStage, Page } from '../types';
import type { AgencySchedulingRepository, AgencyVisit } from '../scheduling/types';
export interface ExternalContact {
    name: string;
    phone: string | null;
    consentReference: string;
}
export interface AgencyDeal {
    id: string;
    agencyId: string;
    propertyId: string;
    cycleId: string;
    buyerId: string | null;
    contactKind: 'account' | 'external';
    privateContact: ExternalContact | null;
    assigneeId: string | null;
    stage: DealStage;
    version: number;
    closedReason: string | null;
}
export interface CreateAgencyDeal {
    propertyId: string;
    buyerId?: string;
    externalContact?: ExternalContact;
    assigneeId?: string;
    clientRequestId: string;
}
export interface AssignAgencyDeal {
    dealId: string;
    userId: string;
    expectedVersion: number;
    clientRequestId: string;
}
export interface AgencyDealRepository {
    scheduling: AgencySchedulingRepository;
    list(input: number | AgencyDealFilter, context: AgencyRequestContext): Promise<Page<AgencyDeal>>;
    get(id: string, context: AgencyRequestContext): Promise<AgencyDeal>;
    create(input: CreateAgencyDeal, context: AgencyRequestContext): Promise<AgencyDeal>;
    assign(input: AssignAgencyDeal, context: AgencyRequestContext): Promise<AgencyDeal>;
    setStage(input: {dealId:string;stage:DealStage;expectedVersion:number;clientRequestId:string}, context: AgencyRequestContext): Promise<AgencyDeal>;
    saveTask(input: SaveAgencyTask, context: AgencyRequestContext): Promise<AgencyTask>;
    finishTask(input: {taskId:string;state:'done'|'cancelled';expectedVersion:number;clientRequestId:string}, context: AgencyRequestContext): Promise<AgencyTask>;
    listTasks(input: {dealId?:string;offset:number}, context: AgencyRequestContext): Promise<Page<AgencyTask>>;
    history(dealId:string,offset:number,context:AgencyRequestContext):Promise<Page<AgencyFollowupEvent>>;
    visits(dealId:string,offset:number,context:AgencyRequestContext):Promise<Page<AgencyVisit>>;
    conversationId(dealId:string,context:AgencyRequestContext):Promise<string|null>;
}
export interface AgencyDealFilter {offset:number;propertyId?:string;assigneeId?:string|null}
export interface AgencyTask {id:string;dealId:string;title:string;kind:'followup'|'external_notification';assigneeId:string|null;dueAt:string|null;state:'open'|'done'|'cancelled';version:number;reason:string|null}
export interface SaveAgencyTask {id?:string;dealId:string;assigneeId:string|null;dueAt:string|null;title:string;expectedVersion?:number;clientRequestId:string}
export interface AgencyFollowupEvent {id:string;dealId:string;taskId:string|null;actorId:string|null;kind:string;createdAt:string;details:{stage?:DealStage;state?:AgencyTask['state'];title?:string;assigneeId?:string|null;previousAssigneeId?:string|null;reason?:string|null}}
