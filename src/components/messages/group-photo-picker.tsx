"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AVATAR_CROP, ImageCropper } from "@/components/account/image-cropper";
import { buildPath, uploadSmall } from "@/lib/upload";

/**
 * Picking a group picture: choose an image, frame it, and it's uploaded to
 * your own folder of the pictures bucket. `children` gets a function that
 * opens the file chooser.
 */
export function GroupPhotoPicker({
  me,
  onUploaded,
  children,
}: {
  me: string;
  onUploaded: (path: string, previewUrl: string) => void | Promise<void>;
  children: (choose: () => void, uploading: boolean) => React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = (picked?: File | null) => {
    if (!picked) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(picked.type)) return void toast.error("Use a PNG, JPG, WEBP or GIF image.");
    if (picked.size > 25 * 1024 * 1024) return void toast.error("Images must be smaller than 25 MB.");
    setFile(picked);
  };

  const upload = async (image: Blob) => {
    const framed = new File([image], "group.jpg", { type: "image/jpeg" });
    setUploading(true);
    try {
      const path = await uploadSmall("avatars", buildPath(me, "", "group", framed), framed);
      setFile(null);
      await onUploaded(path, URL.createObjectURL(framed));
    } catch (err) {
      toast.error("Couldn't upload the picture", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {children(() => input.current?.click(), uploading)}
      <ImageCropper file={file} preset={{ ...AVATAR_CROP, title: "Adjust the group picture" }} onCancel={() => setFile(null)} onConfirm={upload} />
    </>
  );
}
