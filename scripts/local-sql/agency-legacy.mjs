// Kept independent from PostgreSQL so transaction construction is testable.
export function historicalBody(sql) {
 const commands=[...sql.matchAll(/^[\t ]*(begin|commit|rollback);[\t ]*\r?$/gmi)];
 if(commands.length===0)return sql;
 if(commands.at(-1)[1].toLowerCase()!=='rollback')throw Error('Historical SQL must end in rollback');
 if(commands.length!==2||commands[0][1].toLowerCase()!=='begin')throw Error('Unexpected historical transaction boundaries');
 return sql.replace(/^[\t ]*(begin|rollback);[\t ]*\r?$/gmi,'');
}
export function inventoryProjection(columns) {
 if(!columns.length)throw Error('Historical columns required');
 return columns.map(name=>`"${name.replaceAll('"','""')}"`).join(',');
}
