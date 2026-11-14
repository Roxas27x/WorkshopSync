export function sqliteAdapter(sqlite){
 return{
  prepare(sql){let values=[];const statement={
   bind(...args){values=args;return statement;},
   first(){return sqlite.prepare(sql).get(...values)||null;},
   all(){return{results:sqlite.prepare(sql).all(...values)};},
   run(){return statement.execute();},
   execute(){return sqlite.prepare(sql).run(...values);}
  };return statement;},
  batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
 };
}
