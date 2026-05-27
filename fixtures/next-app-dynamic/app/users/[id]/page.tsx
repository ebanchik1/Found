export default function UserDetails({ params }: { params: { id: string } }) {
  return <div>User {params.id}</div>;
}
