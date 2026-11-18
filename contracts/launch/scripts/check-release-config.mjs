import path from 'node:path';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
try{console.log(JSON.stringify(inspectReleaseConfiguration(path.resolve(import.meta.dirname,'..')),null,2));}
catch(error){console.error(JSON.stringify({error:/^RELEASE_[A-Z_]+$/.test(error.message)?error.message:'RELEASE_CHECK_FAILED',executionReady:false,productionReady:false}));process.exitCode=1;}
