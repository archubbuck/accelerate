export interface ProjectInspection {name:string|null;packageManager:string|null;markers:string[];frameworks:string[];frameworkEvidence:'declared-dependencies';accelerateDependencies:{name:string;range:string;section:string}[];installed:{name:string;version:string}[];limitations:string[]}
export function inspectProject(root:string):Promise<ProjectInspection>;
