import {evaluateFlag} from '../src/index.ts';
export function evaluate({input:{flag,context={}}}){
 return {status:'success',data:{enabled:evaluateFlag(flag,context),runtimeWiringVerified:false}};
}
