import { redirect } from "next/navigation";

// One plug-in so far: its page is the plug-ins page.
export default function PluginsPage() {
  redirect("/plugins/dlay");
}
