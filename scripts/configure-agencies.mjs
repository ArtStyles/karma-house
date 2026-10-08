import {parseAgencyCommand,runAgencyCommand} from './agency-activation.mjs';
let command;
try{command=parseAgencyCommand(process.argv.slice(2));}catch(error){console.error(error.message);process.exit(2)}
try{const result=await runAgencyCommand(command);console.log(JSON.stringify(result));if(!result.complete||result.cancellationComplete===false)process.exitCode=1;}catch{console.error('Agency configuration failed; no activation confirmed. Review private operator diagnostics and target prerequisites.');process.exitCode=1;}
