<script lang="ts">
interface Customer {
  name: string;
  email: string;
}
interface Props {
  label: string;
  customer: Customer;
}
let { label, customer }: Props = $props();
let name = $state("");
$effect(() => {
  name = customer.name;
});
function mutate() {
  customer.name = "Changed locally";
  name = customer.name;
}
function read() {
  name = customer.name;
}
</script>

<article aria-label={label}>
  <h2>{label}</h2>
  <p>{name}</p>
  <p>{customer.email}</p>
  <button onclick={mutate}>Change fixture</button>
  <button onclick={read}>Read fixture</button>
</article>
