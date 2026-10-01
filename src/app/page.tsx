import { AgentStepsSidebar } from "@/components/agent-steps-sidebar";
import { AppHeader } from "@/components/app-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AgentStepsSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="requirements">
            <TabsList>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="traceability">
                Traceability matrix
              </TabsTrigger>
              <TabsTrigger value="chat">Chat with spec</TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Extracted requirements will show up here once a spec has been
                uploaded.
              </p>
            </TabsContent>
            <TabsContent value="traceability" className="mt-4">
              <p className="text-sm text-muted-foreground">
                The traceability matrix will map requirements to their
                generated test cases.
              </p>
            </TabsContent>
            <TabsContent value="chat" className="mt-4">
              <p className="text-sm text-muted-foreground">
                Chat with the uploaded spec to ask questions about its
                contents.
              </p>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
