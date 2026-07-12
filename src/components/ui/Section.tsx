type Props = {
  title?: string;
  card?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
};
export function Section({ title, card = false, actions, children }: Props) {
  return (
    <section className={card ? "card flex flex-col gap-3" : "flex flex-col gap-2"}>
      {(title || actions) && (
        <div className="flex items-center justify-between">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
export default Section;
