import { reactive } from "vue";

export const AppBarServiceKey = Symbol('AppBarService');
export class AppBarService {
  public state = reactive({
    textOverride: ""
  });

  set textOverride(value: string) {
    this.state.textOverride = value;
  }
}
