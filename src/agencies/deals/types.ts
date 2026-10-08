import type { AgencyRequestContext, DealStage, Page } from '../types';
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
    list(offset: number, context: AgencyRequestContext): Promise<Page<AgencyDeal>>;
    get(id: string, context: AgencyRequestContext): Promise<AgencyDeal>;
    create(input: CreateAgencyDeal, context: AgencyRequestContext): Promise<AgencyDeal>;
    assign(input: AssignAgencyDeal, context: AgencyRequestContext): Promise<AgencyDeal>;
}
