export const PRIVATE_CSP:string;
export function privatePageHeaders():Array<{source:string;headers:Array<{key:string;value:string}>}>;
export function communityPageHeaders():Array<{source:string;headers:Array<{key:string;value:string}>}>;
export function assertPrivacyEgress(input:{mode:string;destination:string}):void;
