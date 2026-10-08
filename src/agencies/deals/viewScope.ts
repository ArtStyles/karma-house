export function createFollowupViewScope() {
    let active=false,epoch=0,sequence=0;
    return {
        activate(){active=true;epoch++;},
        invalidate(){active=false;epoch++;},
        capture(latest=true){if(!active)throw Error('KH_AGENCY_CONTEXT_CHANGED');const e=epoch,seq=latest?++sequence:sequence;return ()=>{if(!active||e!==epoch||latest&&seq!==sequence)throw Error('KH_AGENCY_CONTEXT_CHANGED');};},
        isActive(){return active;},
    };
}
