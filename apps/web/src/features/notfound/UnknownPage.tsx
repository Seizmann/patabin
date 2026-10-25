import { NavLink } from 'react-router-dom';
import bn from 'i18n/bn';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn } from 'components/ui/base';
import h404 from 'assets/images/backgrounds/404-bg.webp';

export default function UnknownPage() {
  usePageTitle(bn.notFoundTitle);
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <img src={h404} alt="" aria-hidden className="fixed inset-0 -z-10 h-full w-full object-cover opacity-60" />
      <p className="p-label">404</p>
      <h1 className="p-display">{bn.notFoundTitle}</h1>
      <p className="p-caption mt-2 max-w-xs">{bn.notFoundBody}</p>
      <NavLink to="/" className="mt-6">
        <Btn>{bn.goHome}</Btn>
      </NavLink>
    </div>
  );
}
