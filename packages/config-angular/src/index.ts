import {InjectionToken,type Provider} from "@angular/core";
import {defineConfig,type ConfigShape,type ConfigValues} from "@accelerate/config-core";
export function createConfigToken<T extends ConfigShape>(name:string,shape:T){const token=new InjectionToken<ConfigValues<T>>(name);return {token,provide(source:Readonly<Record<string,unknown>>):Provider{return {provide:token,useFactory:()=>defineConfig(shape,source)};}};}
