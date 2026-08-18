import { supabase } from "@/integrations/supabase/client";

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export type UploadResult = { url: string; path: string };

/** Uploads an image to the private `profiles` bucket and returns a long-lived signed URL. */
export async function uploadProfileImage(file: File, folder: string): Promise<UploadResult> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("Lejohen vetëm fotografi JPG, PNG ose WEBP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Fotografia nuk mund të jetë më e madhe se 5MB.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("profiles").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error("Ngarkimi i fotografisë dështoi. Provo përsëri.");
  const { data, error: signErr } = await supabase.storage
    .from("profiles")
    .createSignedUrl(path, TEN_YEARS);
  if (signErr || !data?.signedUrl) throw new Error("Nuk u gjenerua lidhja e fotografisë.");
  return { url: data.signedUrl, path };
}
