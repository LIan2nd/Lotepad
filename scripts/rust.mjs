import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
const bin=join(homedir(),".cargo","bin");
const executable=join(bin,process.platform==="win32"?"cargo.exe":"cargo");
const child=spawn(existsSync(executable)?executable:"cargo",process.argv.slice(2),{
 stdio:"inherit",windowsHide:true,env:{...process.env,PATH:bin+delimiter+process.env.PATH},
});
child.on("error",error=>{console.error(error.message);process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
