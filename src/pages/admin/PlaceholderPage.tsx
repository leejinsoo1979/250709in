import styles from './PlaceholderPage.module.css';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const PlaceholderPage = ({ title, description, icon }: PlaceholderPageProps) => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>{icon}</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        <div className={styles.badge}>준비 중</div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
