/**
 * Minimal type declarations for spark-md5.
 *
 * The package ships no declarations of its own, and only its static
 * ArrayBuffer.hash is used, by the transform pipeline tool to compute MD5
 * digests in the browser. Declaring just that keeps the import typed without
 * pulling in the whole incremental API.
 */
declare module "spark-md5" {
  interface ArrayBufferStatic {
    /** One-shot MD5 of a buffer. Hex by default, raw binary when raw is true. */
    hash(arr: ArrayBuffer, raw?: boolean): string;
  }

  const SparkMD5: {
    ArrayBuffer: ArrayBufferStatic;
  };

  export default SparkMD5;
}
