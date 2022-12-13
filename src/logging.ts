function debug(message?: any, ...optionalParams: any[]) {
    console.debug(message, ...optionalParams);
}

function log(message?: any, ...optionalParams: any[]) {
    console.log(message, ...optionalParams);
}

function info(message?: any, ...optionalParams: any[]) {
    console.info(message, ...optionalParams);
}

function warn(message?: any, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
}

export { debug, log, info, warn };
