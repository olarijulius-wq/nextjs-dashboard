import SideNav from '@/app/ui/dashboard/sidenav';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
 
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  return (
    <div className="dark [color-scheme:dark]">
      <div className="flex h-screen flex-col bg-black text-slate-100 md:flex-row md:overflow-hidden">
        <div className="w-full flex-none border-b border-neutral-800 bg-black md:w-64 md:border-b-0 md:border-r md:border-neutral-800">
          <SideNav />
        </div>
        <div className="grow bg-black p-6 md:overflow-y-auto md:p-12">{children}</div>
      </div>
    </div>
  );
}
