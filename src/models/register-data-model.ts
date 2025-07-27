/**
 * Describes a resource file, including its location and contents.
 */
export type ResourceModel = {
    /** The name of the resource file (including extension), e.g. "config.json". */
    fileName: string;
    
    /** The file system path to the resource, either absolute or relative. */
    path: string;

    /** The full UTF‑8 text contents of the resource file. */
    content: string;
};
