import { createApp } from "vue";
import { Icon } from "@iconify/vue";
import "bootstrap/dist/css/bootstrap.min.css";
import "./assets/styles.css";
import App from "./App.vue";
import router from "./router";

createApp(App).use(router).component("Icon", Icon).mount("#app");
