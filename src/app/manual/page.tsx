import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "操作マニュアル | SubscList",
  description: "SubscListの登録、日々の確認、契約管理、分析、設定方法を画面ごとに説明します。",
  robots: { index: false, follow: false },
};

const contents = [
  ["start", "まず最初に"],
  ["today", "Today・ダッシュボード"],
  ["news", "契約ニュース"],
  ["subscriptions", "サブスクの登録・編集・削除"],
  ["calendar", "カレンダー"],
  ["analysis", "分析・月次レポート・見直し"],
  ["simulation", "入替比較"],
  ["categories", "カテゴリ・支払い方法"],
  ["payments", "支払い履歴・支払い累計"],
  ["savings", "節約実績"],
  ["notifications", "通知"],
  ["csv", "CSV入出力"],
  ["billing", "無料公開版と以前のStripe契約"],
  ["settings", "設定・ログアウト・アカウント削除"],
  ["admin", "管理者の操作"],
  ["trouble", "困ったとき"],
] as const;

function ManualSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <details id={id} className="scroll-mt-6 border-b border-slate-200 py-5 last:border-b-0" open>
      <summary className="cursor-pointer list-none text-lg font-black text-slate-950 marker:hidden">
        <span className="mr-2 inline-grid size-7 place-items-center rounded-md bg-blue-100 text-sm font-black text-blue-900" aria-hidden="true">+</span>
        {title}
      </summary>
      <div className="mt-4 space-y-3 pl-0 text-sm leading-7 text-slate-800 sm:pl-9">{children}</div>
    </details>
  );
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 marker:font-bold marker:text-blue-800">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ol>
  );
}

export default function ManualPage() {
  return (
    <main className="min-h-screen bg-[#f2f8fb] px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-blue-800" aria-label="ページ案内">
            <Link href="/" className="underline-offset-4 hover:underline">SubscListトップ</Link>
            <Link href="/login" className="underline-offset-4 hover:underline">ログイン</Link>
            <Link href="/faq" className="underline-offset-4 hover:underline">よくある質問</Link>
            <Link href="/contact" className="underline-offset-4 hover:underline">お問い合わせ</Link>
          </nav>
          <h1 className="mt-6 text-3xl font-black sm:text-4xl">SubscList 操作マニュアル</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-700">
            画面ごとに、押す場所と入力する内容を順番に説明します。わからない言葉が出たら、近くの「注意」も読んでください。
          </p>
          <p className="mt-3 rounded-md border-l-4 border-amber-500 bg-amber-50 p-4 text-sm font-semibold leading-7 text-amber-950">
            SubscListは契約情報を記録・整理するサービスです。各サービスへの申込み、実際の請求、解約手続きは代行しません。請求日や解約条件は、必ず契約先の公式画面でも確認してください。
          </p>
        </header>

        <nav className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="マニュアル目次">
          <h2 className="text-base font-black">知りたい操作を選ぶ</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm font-semibold sm:grid-cols-2 lg:grid-cols-3">
            {contents.map(([id, label]) => (
              <li key={id}><a className="text-blue-800 underline decoration-blue-300 underline-offset-4 hover:text-blue-950" href={`#${id}`}>{label}</a></li>
            ))}
          </ul>
        </nav>

        <article className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-5 shadow-sm sm:px-8">
          <ManualSection id="start" title="1. まず最初に">
            <Steps items={[
              "初めて使う場合はトップページから「新規登録」へ進み、名前とメールアドレスを入力して利用規約・プライバシーポリシーに同意し、登録します。",
              "届いたメールの確認リンクを開きます。認証画面でパスワードを設定すると登録完了です。メールが届かない場合は迷惑メールを確認し、ログイン画面の再送案内を使ってください。",
              "登録済みの方はログイン画面でメールアドレスとパスワードを入力します。Googleログインは画面にボタンが表示されている場合に利用できます。パスワードを忘れた場合は「パスワードを忘れた方」から再設定します。",
              "ログインしたら「サブスク」から、現在契約しているサービスを1件ずつ登録します。請求日・金額・周期は、契約先の請求画面を見ながら入力してください。",
              "登録後は「Today」で期限を確認し、「カレンダー」で月ごとの請求予定を確認します。初めて画面を試す場合はトップページのデモを使えます。デモは閲覧専用です。",
            ]} />
          </ManualSection>

          <ManualSection id="today" title="2. Today・ダッシュボード">
            <p><Link className="font-bold text-blue-800 underline" href="/today">Today</Link>は、今日対応することを先に確認する画面です。今日の請求、近い更新日、期限、今月の支払済み金額などを見ます。</p>
            <Steps items={[
              "「今日やること」に表示された項目を上から確認します。サブスク名を押すと、その契約の詳細を開けます。",
              "利用確認が出た契約は、実際に使ったかを選びます。使っていない記録が続いたら、見直しの材料にします。",
              "「ダッシュボード」では月額合計、更新予定、カテゴリ別支出、期限アラート、お知らせをまとめて確認します。",
              "月額予算を設定したい場合は「設定」を開き、「予算・通知」に入力して保存します。",
            ]} />
          </ManualSection>

          <ManualSection id="news" title="3. 契約ニュース">
            <p>契約中のサービスに関係する記事を確認する画面です。ニュースは自動で毎朝更新されません。</p>
            <Steps items={[
              "「契約ニュース」を開き、「最新情報を取得」を押します。",
              "表示された見出しから読みたい記事を押すと、記事の要約を確認できます。詳しい内容は記事内の出典リンクで確認してください。",
              "記事が見つからない場合は、契約サービス名が登録情報と一致しているか確認してから、もう一度取得します。取得できる情報や記事数は情報源の状況により変わります。",
            ]} />
            <p className="rounded-md bg-slate-50 p-3 text-slate-700">記事の要約は参考情報です。料金や提供条件を変更する前に、必ずサービス提供元の最新案内を確認してください。</p>
          </ManualSection>

          <ManualSection id="subscriptions" title="4. サブスクの登録・編集・削除">
            <Steps items={[
              "「サブスク」を開き、「新規登録」を押します。",
              "サービス名、料金、請求周期、次回更新日など、画面で必須と表示された項目を入力します。エラーが出たら、赤く表示された項目を直してください。",
              "カテゴリと支払い方法を選びます。まだ選択肢がない場合は、先に「カテゴリ」または「支払い方法」画面で登録します。",
              "無料期間の終了日、解約期限、サービスURLや解約URLがわかる場合は入力します。解約URLは契約先が案内するページを入力してください。",
              "保存後、一覧のサービス名を押して詳細を開きます。「編集」から登録内容を直し、削除する場合は詳細画面の削除操作を使います。削除前に対象名を確認してください。",
            ]} />
            <p className="rounded-md bg-amber-50 p-3 text-amber-950">請求周期を登録すると、カレンダーに次回以降の予定日が表示されます。これは予定の記録であり、サービス提供元への支払いを実行する機能ではありません。</p>
            <p>詳細画面の「操作」では、利用状況の記録、更新判断、AI診断、解約チェックリストや証跡の記録などを使えます。AI診断は契約詳細の「操作」から実行します。結果は候補を考えるための参考で、実際の料金・提供内容は各社の公式情報を確認してください。AI設定がない・一時的に利用できない場合は、表示された案内に従ってください。</p>
            <p>利用回数を記録する場合は、契約詳細で「今日使った」または週単位の確認を行います。記録が続くと利用状況の集計や見直し判断に使われます。</p>
          </ManualSection>

          <ManualSection id="calendar" title="5. カレンダー">
            <Steps items={[
              "「カレンダー」を開き、前月・翌月の操作で見たい月へ移動します。",
              "日付の中に表示される契約名と金額を見て、同じ日に重なる支払いを確認します。契約名を押すと詳細を開けます。",
              "月末日やうるう年を含む周期は登録した更新日を基準に予定を表示します。実際の請求日は提供元によって異なる場合があるため、請求明細も確認してください。",
              "カレンダーの書き出しが必要な場合は「CSV」画面を確認します。利用できる書き出し形式はプラン表示に従います。",
            ]} />
          </ManualSection>

          <ManualSection id="analysis" title="6. 分析・月次レポート・見直し">
            <p><Link className="font-bold text-blue-800 underline" href="/analytics">分析</Link>は契約・支払いの集計、<Link className="font-bold text-blue-800 underline" href="/monthly-report">月次レポート</Link>は月ごとの確認、<Link className="font-bold text-blue-800 underline" href="/review">見直し</Link>は対応の優先順位を確認する画面です。</p>
            <Steps items={[
              "まず契約の金額・請求周期・利用状況・仕事利用割合を正しく登録します。入力が少ないと集計も少なくなります。",
              "「分析」でグラフや割合を見ます。割合は登録済みデータの内訳であり、将来の節約を保証する数字ではありません。",
              "「月次レポート」で対象月を選び、予定と支払い履歴を確認します。月末には未整理の支払いがないか確認してください。",
              "「見直し」に並ぶ期限・未使用・金額の項目を確認し、続ける、変更する、解約を検討するなどの判断を記録します。",
              "実際に変更が完了した後だけ「節約実績」に登録します。検討中の金額を確定実績として登録しないでください。",
            ]} />
          </ManualSection>

          <ManualSection id="simulation" title="7. 入替比較">
            <Steps items={[
              "「入替比較」を開きます。",
              "残す契約にチェックを入れ、外す契約を選びます。表示された月額・年間の差を確認します。",
              "この画面の比較だけでは契約内容は変わりません。変更や解約は各サービス提供元で手続きしてください。",
            ]} />
          </ManualSection>

          <ManualSection id="categories" title="8. カテゴリ・支払い方法">
            <p>「カテゴリ」では動画、仕事道具などの分類を登録・編集します。「支払い方法」では、契約で使う支払い元を整理します。</p>
            <Steps items={[
              "各画面で追加ボタンを押し、名前を入力して保存します。",
              "すでに契約に使っている項目を変更する前に、その項目がどの契約に設定されているか確認します。",
              "支払い方法は実際のカード番号や銀行口座を登録する画面ではありません。決済情報は入力しないでください。",
            ]} />
          </ManualSection>

          <ManualSection id="payments" title="9. 支払い履歴・支払い累計">
            <Steps items={[
              "「支払い履歴」で実際に支払った日、金額、対象契約を登録または確認します。予定日ではなく、明細で確認した支払日を使います。",
              "科目や証憑番号・URLを使う場合は、入力欄へ記録します。証憑リンクには他人が見られないURLを使ってください。",
              "CSV明細から支払い履歴を取り込む場合は、先に「CSV」でプレビューし、契約候補と金額・日付を確認してから登録します。",
              "「支払い累計」では記録済みの支払いを年ごとに見ます。履歴を登録していない期間の支払いは集計されません。",
              "「年間整理レポート」は支払い累計から開けます。対象年を選び、仕事利用分と科目・証憑の整理状況を確認します。印刷が必要なら画面の印刷ボタンを使います。",
            ]} />
          </ManualSection>

          <ManualSection id="savings" title="10. 節約実績">
            <Steps items={[
              "サービス側で解約、プラン変更、乗り換え、料金交渉が実際に完了してから開きます。",
              "対象契約、変更の種類、完了日、変更後に確認できた削減額を入力して保存します。",
              "今月・今年・累計の金額と履歴を確認します。予定やAIの提案額ではなく、完了後に確認した額を記録してください。",
            ]} />
          </ManualSection>

          <ManualSection id="notifications" title="11. 通知">
            <Steps items={[
              "「通知」で更新日、無料期間終了日、解約期限などの通知予定を確認します。",
              "通知を止めたい契約は、その契約の詳細または通知画面にある停止操作を使います。再開するときも同じ場所で設定します。",
              "通知を一時停止できる表示がある場合は期間を選びます。契約自体の更新や解約は停止されません。",
              "「設定」の「予算・通知」で標準の通知日数、通知時刻、月次サマリーを調整します。",
              "「最近の送信履歴」で、送信済みの記録を確認します。履歴がない場合はメール設定や迷惑メールも確認してください。",
            ]} />
          </ManualSection>

          <ManualSection id="csv" title="12. CSV入出力">
            <p>CSVは表計算ソフトで読めるファイルです。契約データの移行やバックアップに使えます。</p>
            <h3 className="font-black text-slate-950">取り込む手順</h3>
            <Steps items={[
              "「CSV」を開き、「インポート用テンプレート」をダウンロードします。カード・銀行明細から試す場合はサンプルも使えます。",
              "テンプレートの列名に合わせて入力します。1行目が列名（ヘッダー）の場合は、画面で「1行目はヘッダー」を選びます。ヘッダーがないファイルでは選びません。",
              "CSVを選び、「プレビュー」または候補検出を実行します。サービス名、金額、日付、支払い方法の対応を一行ずつ見直します。",
              "問題がなければ登録を実行します。重複や未対応行が表示された場合は、内容を確認して元ファイルを直してからやり直します。",
            ]} />
            <h3 className="font-black text-slate-950">書き出す手順</h3>
            <Steps items={[
              "同じ画面の出力欄から、必要なCSVを選びます。",
              "保存したファイルを開き、1行目のヘッダーと各列の説明を確認します。",
              "ファイルには契約や支払い情報が含まれます。共有先を確認し、安全な場所に保管してください。",
            ]} />
            <p className="rounded-md bg-amber-50 p-3 text-amber-950">CSV取込でデータが二重にならないよう、実行前のプレビューを必ず確認してください。</p>
          </ManualSection>

          <ManualSection id="billing" title="13. 無料公開版と以前のStripe契約">
            <p>現在はポートフォリオ用の無料公開版です。サブスク・カテゴリの登録数に上限はなく、CSV、分析、通知、解約支援を含む全機能を利用できます。新しい有料契約の申込みはできません。</p>
            <Steps items={[
              "新しい利用者は、アカウント登録後すぐに全機能を無料で使えます。カード登録は不要です。",
              "過去にStripe契約を開始した利用者は、「設定」に表示されるStripe契約・請求リンクを開きます。",
              "Stripe上で契約状態、次回請求日、支払い方法を確認します。継続課金を止める場合はStripe側で解約を完了してください。",
              "無料公開版への変更だけではStripe契約は解約されません。解約完了と請求停止をStripe側で確認してください。",
            ]} />
            <p className="rounded-md bg-amber-50 p-3 text-amber-950">SubscList側では既存Stripe契約を自動解約しません。請求停止を希望する場合は、Stripe上の契約状態を必ず確認してください。</p>
          </ManualSection>

          <ManualSection id="settings" title="14. 設定・ログアウト・アカウント削除">
            <Steps items={[
              "「設定」の「プロフィール」で表示名を変更します。",
              "メールアドレスを変更する場合は新しいアドレスを入力し、届いた確認メールのリンクを開きます。確認が終わるまで変更は完了しません。",
              "パスワードを変える場合は現在のパスワードと、新しいパスワードを確認欄を含めて入力します。",
              "心当たりのないログインがあれば、ログインセキュリティの履歴を確認し、「すべての端末からログアウト」を押してからパスワードを変更します。",
              "アカウントデータはJSONでダウンロードできます。アカウント削除は同じ設定画面の下部から行います。削除は取り消せません。",
              "ログアウトは設定画面上部の「ログアウト」を押します。共有端末では、利用後に必ずログアウトしてください。",
            ]} />
            <p className="rounded-md bg-rose-50 p-3 font-semibold text-rose-950">以前のStripe契約が継続中の場合は、先にStripe側で解約してください。デモアカウントと管理者アカウントは削除できません。</p>
          </ManualSection>

          <ManualSection id="admin" title="15. 管理者の操作（管理者のみ）">
            <p>管理者メニューは管理者アカウントでログインした場合だけ表示されます。一般ユーザーのアカウントでは操作できません。</p>
            <Steps items={[
              "「管理者メニュー」で「お知らせ作成」にタイトルと本文を入力し、公開状態を確認して登録します。公開したお知らせは利用者のダッシュボードに表示されます。",
              "「一斉メール送信」は登録者へ個別にメールを送ります。送信対象と本文を慎重に確認し、必要な連絡だけを送ってください。",
              "「メンテナンス中にする」を押すと、管理者以外の利用者はメンテナンス画面へ案内されます。作業が終わったら「通常モードに戻す」を押します。",
              "「自動通知ジョブ」で最終状態を確認します。「契約ニュースの手動取得」ではニュース取得を実行できます。",
              "「メール送信設定」は設定済みかどうかを確認する表示です。秘密鍵やパスワードは画面に表示されません。メールの実配信確認は専用の検証宛先で行ってください。",
              "「ユーザー一覧」は運用確認に使います。利用者の個人情報を目的外に閲覧・共有しないでください。",
            ]} />
          </ManualSection>

          <ManualSection id="trouble" title="16. 困ったとき">
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>ログインできない:</strong> メールアドレスを確認し、パスワード再設定を試します。メール認証が済んでいない場合は、認証メールを再送します。</li>
              <li><strong>画面が更新されない:</strong> 画面を再読み込みします。何度も更新が続く場合は操作を止め、発生した画面と時刻を控えてお問い合わせください。</li>
              <li><strong>契約数や機能が違う:</strong> 「契約・解約」でプラン状態を見て、「課金状態を再確認」を実行します。</li>
              <li><strong>CSVを読み込めない:</strong> テンプレートの列名、文字コード、ヘッダー設定、ファイルのサイズと行数を確認します。画面の項目説明も開いてください。</li>
              <li><strong>通知が届かない:</strong> 「通知」の送信履歴、メールアドレス、迷惑メールフォルダを確認します。</li>
              <li>解決しない場合は<Link className="font-bold text-blue-800 underline" href="/contact">お問い合わせ</Link>から、問題の画面、操作、発生時刻を伝えてください。パスワード、認証リンク、カード番号は送らないでください。</li>
            </ul>
          </ManualSection>
        </article>

        <footer className="mt-5 flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm font-semibold text-slate-700">
          <Link href="/terms" className="underline underline-offset-4">利用規約</Link>
          <Link href="/privacy" className="underline underline-offset-4">プライバシー</Link>
          <Link href="/security" className="underline underline-offset-4">セキュリティ</Link>
        </footer>
      </div>
    </main>
  );
}
