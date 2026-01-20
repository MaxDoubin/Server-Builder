import { User, Award, BookOpen, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/pages/dashboard-shell";
import { Panel } from "@/pages/dashboard-widgets";

const bio = `Max Doubin is a student at South Career and Technical Academy with a strong focus on technology, leadership, and community impact. He serves as president of the Cyber Club and the Music Club, and competes on Varsity Quiz. Max is also a Blue Ribbon Commissioner for Educational Excellence for the City of Henderson, where he works directly with the City Council and local school boards to support efforts that improve educational opportunities and student outcomes.

A top 1% National Cyber League competitor, Max is passionate about cybersecurity, systems, and building real projects. Over several years, Max has built and continuously expanded a large-scale home lab that manages more than 1.2 petabytes of data and is backed by 12 TB of RAM. He developed this environment as a serious engineering platform, designed to support high-fidelity testing, large workloads, and real-world infrastructure experimentation.

That foundation directly led to Max’s work on HyperScale: a hyper-realistic, scalable datacenter simulation built for technical users who want to model how modern infrastructure behaves under real constraints. HyperScale is designed to make datacenter concepts tangible, from capacity planning and resource contention to failure scenarios and performance tradeoffs, giving builders a practical way to stress-test ideas before they reach production.

In his free time, Max enjoys collecting Apple products, building and managing servers, playing chess, and staying involved in work that creates positive change in his community.

Fun fact: Max is a multi-time Nevada All-State percussionist.

@maxdoubin`;

export function AboutDashboard() {
  return (
    <DashboardShell
      title="About Max Doubin"
      subtitle="Founder profile, mission, and the story behind HyperScale."
    >
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Panel title="Profile">
          <div className="flex flex-col items-center gap-4">
            <div className="h-48 w-48 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <img
                src="/IMG_9293.jpg"
                alt="Max Doubin"
                className="h-full w-full object-cover"
              />


            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-white">Max Doubin</div>
              <div className="text-xs uppercase tracking-widest text-cyan-300/80">
                HyperScale Creator
              </div>
            </div>
            <div className="grid gap-2 text-xs text-white/70">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-cyan-300" />
                Student, leader, builder
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Top 1% National Cyber League
              </div>
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-cyan-300" />
                Nevada All-State Percussionist
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-cyan-300" />
                Blue Ribbon Commissioner
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Biography">
          <div className="space-y-4 text-sm text-white/70 whitespace-pre-line">
            {bio}
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
