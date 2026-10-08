import {parseAgencyCommand,runAgencyCommand} from './agency-activation.mjs';
let command;
try{command=parseAgencyCommand(process.argv.slice(2),true);}catch(error){console.error(error.message);process.exit(2)}
try{console.log(JSON.stringify(await runAgencyCommand(command)));}catch{console.error('Agency verification failed; schema, ledger, permissions or target prerequisites are incomplete.');process.exitCode=1;}
