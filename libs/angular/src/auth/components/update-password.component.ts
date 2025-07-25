// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Directive } from "@angular/core";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { MasterPasswordPolicyOptions } from "@bitwarden/common/admin-console/models/domain/master-password-policy-options";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { MasterPasswordApiService } from "@bitwarden/common/auth/abstractions/master-password-api.service.abstraction";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { VerificationType } from "@bitwarden/common/auth/enums/verification-type";
import { PasswordRequest } from "@bitwarden/common/auth/models/request/password.request";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { Verification } from "@bitwarden/common/auth/types/verification";
import { EncString } from "@bitwarden/common/key-management/crypto/models/enc-string";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/key-management/master-password/abstractions/master-password.service.abstraction";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { MasterKey, UserKey } from "@bitwarden/common/types/key";
import { DialogService, ToastService } from "@bitwarden/components";
import { KdfConfigService, KeyService } from "@bitwarden/key-management";

import { ChangePasswordComponent as BaseChangePasswordComponent } from "./change-password.component";

@Directive()
export class UpdatePasswordComponent extends BaseChangePasswordComponent {
  hint: string;
  key: string;
  enforcedPolicyOptions: MasterPasswordPolicyOptions;
  showPassword = false;
  currentMasterPassword: string;

  onSuccessfulChangePassword: () => Promise<void>;

  constructor(
    protected router: Router,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    policyService: PolicyService,
    keyService: KeyService,
    messagingService: MessagingService,
    private masterPasswordApiService: MasterPasswordApiService,
    private userVerificationService: UserVerificationService,
    private logService: LogService,
    dialogService: DialogService,
    kdfConfigService: KdfConfigService,
    masterPasswordService: InternalMasterPasswordServiceAbstraction,
    accountService: AccountService,
    toastService: ToastService,
  ) {
    super(
      accountService,
      dialogService,
      i18nService,
      kdfConfigService,
      keyService,
      masterPasswordService,
      messagingService,
      platformUtilsService,
      policyService,
      toastService,
    );
  }

  togglePassword(confirmField: boolean) {
    this.showPassword = !this.showPassword;
    document.getElementById(confirmField ? "masterPasswordRetype" : "masterPassword").focus();
  }

  async cancel() {
    await this.router.navigate(["/vault"]);
  }

  async setupSubmitActions(): Promise<boolean> {
    if (this.currentMasterPassword == null || this.currentMasterPassword === "") {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("masterPasswordRequired"),
      });
      return false;
    }

    const secret: Verification = {
      type: VerificationType.MasterPassword,
      secret: this.currentMasterPassword,
    };
    try {
      await this.userVerificationService.verifyUser(secret);
    } catch (e) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: e.message,
      });
      return false;
    }
    const userId = await firstValueFrom(getUserId(this.accountService.activeAccount$));
    this.kdfConfig = await this.kdfConfigService.getKdfConfig(userId);
    return true;
  }

  async performSubmitActions(
    newMasterKeyHash: string,
    newMasterKey: MasterKey,
    newUserKey: [UserKey, EncString],
  ) {
    try {
      // Create Request
      const request = new PasswordRequest();
      request.masterPasswordHash = await this.keyService.hashMasterKey(
        this.currentMasterPassword,
        await this.keyService.getOrDeriveMasterKey(this.currentMasterPassword),
      );
      request.newMasterPasswordHash = newMasterKeyHash;
      request.key = newUserKey[1].encryptedString;

      // Update user's password
      await this.masterPasswordApiService.postPassword(request);

      this.toastService.showToast({
        variant: "success",
        title: this.i18nService.t("masterPasswordChanged"),
        message: this.i18nService.t("logBackIn"),
      });

      if (this.onSuccessfulChangePassword != null) {
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.onSuccessfulChangePassword();
      } else {
        this.messagingService.send("logout");
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
}
