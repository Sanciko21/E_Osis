import { Link } from 'react-router';
import { appConfig } from '../../config/appConfig.js';
import { aos } from '../../utils/motion.js';
import Copyright from '../brand/Copyright.jsx';
import Logo from '../brand/Logo.jsx';
import Icon from '../ui/Icon.jsx';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid" {...aos('fade-up', { offset: 0 })}>
        <div className="footer__about">
          <Logo inverted size={40} />
          <p>
            Sistem pemilihan Ketua dan Wakil Ketua OSIS{appConfig.schoolName ? ` ${appConfig.schoolName}` : ''} yang
            langsung, umum, bebas, rahasia, jujur, dan adil.
          </p>
          <ul className="footer__chips" aria-label="Asas pemilihan">
            <li>Luber</li>
            <li>Jurdil</li>
            <li>Satu NISN, satu suara</li>
          </ul>
        </div>
        <nav className="footer__links" aria-label="Tautan footer">
          <p className="footer__heading">Jelajahi</p>
          <ul>
            <li>
              <Link to="/#kandidat">
                <Icon name="users" size={16} /> Pasangan calon
              </Link>
            </li>
            <li>
              <Link to="/#jadwal">
                <Icon name="calendar" size={16} /> Jadwal &amp; tahapan
              </Link>
            </li>
            <li>
              <Link to="/hasil">
                <Icon name="chart" size={16} /> Hasil pemilihan
              </Link>
            </li>
          </ul>
        </nav>
        <div className="footer__links">
          <p className="footer__heading">Panitia</p>
          <ul>
            <li>
              <Link to="/admin/login">
                <Icon name="lock" size={16} /> Masuk admin
              </Link>
            </li>
          </ul>
          <p className="footer__note">
            <Icon name="help" size={16} /> Ada kendala saat memilih? Hubungi panitia pemilihan di sekolah.
          </p>
        </div>
      </div>
      <div className="container footer__bottom">
        <Copyright className="footer__copyright" />
        <p>E-OSIS{appConfig.schoolName ? ` · ${appConfig.schoolName}` : ''} · Dikelola oleh Panitia Pemilihan OSIS.</p>
      </div>
    </footer>
  );
}
